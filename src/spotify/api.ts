/**
 * Client Web API Spotify, aligné sur les endpoints en vigueur depuis février 2026 :
 * /playlists/{id}/items, POST /me/playlists, GET /tracks/{id} unitaire, recherche limitée à 10.
 */
import type { PlaylistSummary, Track } from '../types'
import { getToken } from './auth'

const BASE = 'https://api.spotify.com/v1'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function call<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const token = await getToken()
  if (!token) throw new ApiError(401, 'Session Spotify expirée, reconnecte-toi.')
  const res = await fetch(path.startsWith('http') ? path : BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  if (res.status === 429) {
    const body = await res.clone().json().catch(() => null)
    if (body?.error?.reason === 'QUOTA_EXCEEDED') {
      throw new ApiError(429, 'Quota Spotify du mode développeur atteint. Réessaie un peu plus tard.')
    }
    if (attempt < 3) {
      await wait((Number(res.headers.get('Retry-After')) || 1) * 1000)
      return call<T>(path, init, attempt + 1)
    }
    throw new ApiError(429, 'Trop de requêtes envoyées à Spotify. Réessaie dans un instant.')
  }
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error?.message ?? `Erreur Spotify (${res.status})`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

/* ---------- Conversion ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseTrack(raw: any): Track | null {
  if (!raw || raw.type !== 'track' || raw.is_local || !raw.id) return null
  const images: { url: string; width: number | null }[] = raw.album?.images ?? []
  const medium =
    images.find((i) => (i.width ?? 0) >= 250 && (i.width ?? 0) <= 700) ?? images[1] ?? images[0] ?? null
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    artists: (raw.artists ?? []).map((a: { name: string }) => a.name).join(', '),
    album: raw.album?.name ?? '',
    image: medium?.url ?? null,
    durationMs: raw.duration_ms ?? 0,
  }
}

/* ---------- Lecture ---------- */

export async function getMe(): Promise<{ id: string; name: string }> {
  const me = await call<{ id: string; display_name?: string }>('/me')
  return { id: me.id, name: me.display_name || me.id }
}

export async function getMyPlaylists(meId: string): Promise<PlaylistSummary[]> {
  const out: PlaylistSummary[] = []
  for (let offset = 0; offset < 1000; offset += 50) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await call<{ items: any[]; next: string | null }>(`/me/playlists?limit=50&offset=${offset}`)
    for (const p of page.items ?? []) {
      if (!p) continue
      out.push({
        id: p.id,
        name: p.name || 'Sans titre',
        image: p.images?.[p.images.length > 1 ? 1 : 0]?.url ?? null,
        total: p.items?.total ?? p.tracks?.total ?? 0,
        readable: p.owner?.id === meId || p.collaborative === true,
      })
    }
    if (!page.next) break
  }
  return out
}

export async function getPlaylistTracks(id: string): Promise<Track[]> {
  const out: Track[] = []
  for (let offset = 0; offset < 5000; offset += 50) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await call<{ items?: any[]; next: string | null }>(
      `/playlists/${id}/items?limit=50&offset=${offset}&additional_types=track`,
    )
    for (const entry of page.items ?? []) {
      const t = parseTrack(entry?.item ?? entry?.track)
      if (t) out.push(t)
    }
    if (!page.next) break
  }
  return out
}

export async function searchTracks(q: string, offset = 0): Promise<{ tracks: Track[]; hasMore: boolean }> {
  const params = new URLSearchParams({ q, type: 'track', limit: '10', offset: String(offset) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await call<{ tracks: { items: any[]; next: string | null } }>(`/search?${params}`)
  const tracks = (res.tracks?.items ?? []).map(parseTrack).filter((t): t is Track => t !== null)
  return { tracks, hasMore: Boolean(res.tracks?.next) }
}

export async function getTrack(id: string): Promise<Track | null> {
  try {
    return parseTrack(await call(`/tracks/${id}`))
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null
    throw e
  }
}

/* ---------- Liens collés ---------- */

export interface ParsedLinks {
  trackIds: string[]
  playlistIds: string[]
}

export function parseLinks(text: string): ParsedLinks {
  const re = /(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(track|playlist)[/:]([A-Za-z0-9]{22})/g
  const trackIds = new Set<string>()
  const playlistIds = new Set<string>()
  for (const m of text.matchAll(re)) (m[1] === 'track' ? trackIds : playlistIds).add(m[2])
  return { trackIds: [...trackIds], playlistIds: [...playlistIds] }
}

export async function getTracksByIds(ids: string[], onProgress?: (done: number) => void): Promise<Track[]> {
  const out: (Track | null)[] = new Array(ids.length).fill(null)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < ids.length) {
      const i = next++
      out[i] = await getTrack(ids[i])
      onProgress?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker))
  return out.filter((t): t is Track => t !== null)
}

/* ---------- Écriture ---------- */

export async function savePlaylist(
  name: string,
  uris: string[],
): Promise<{ id: string; url: string }> {
  const created = await call<{ id: string; external_urls?: { spotify?: string } }>('/me/playlists', {
    method: 'POST',
    body: JSON.stringify({ name, description: 'Classée avec Sillon', public: false }),
  })
  for (let i = 0; i < uris.length; i += 100) {
    await call(`/playlists/${created.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    })
  }
  return { id: created.id, url: created.external_urls?.spotify ?? `https://open.spotify.com/playlist/${created.id}` }
}

/* ---------- Lecture audio (Web Playback SDK) ---------- */

export async function transferPlayback(deviceId: string): Promise<void> {
  await call('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [deviceId], play: false }) })
}

export async function startPlayback(deviceId: string, uri: string, positionMs: number): Promise<void> {
  await call(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
  })
}
