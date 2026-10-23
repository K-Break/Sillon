/**
 * Système de mise en cache locale des extraits audio.
 *
 * Utilise l'API CacheStorage du navigateur pour enregistrer les extraits audio (30s) en local.
 * Une fois mis en cache :
 * - Zéro appel à l'API Spotify (évite l'erreur 429 et les quotas).
 * - Zéro requête réseau lors des duels suivants (lecture instantanée depuis le disque).
 * - Zéro latence.
 */
import type { Track } from '../types'

const CACHE_NAME = 'sillon-audio-v1'
const blobUrlMap = new Map<string, string>()
const fetchingMap = new Map<string, Promise<string | null>>()

function cacheKey(trackId: string): string {
  return `https://sillon.local/audio/${encodeURIComponent(trackId)}`
}

function cleanQuery(track: Track): string {
  const cleanName = track.name
    .replace(/\s*[\(\[](?:feat\.|remaster|version|deluxe|radio edit|mono|stereo|bonus).*?[\)\]]/gi, '')
    .trim()
  const firstArtist = track.artists.split(',')[0].trim()
  return `${cleanName} ${firstArtist}`.trim()
}

/**
 * Récupère l'URL locale d'un extrait audio pour un morceau.
 * 1. Vérifie si le fichier est déjà en mémoire.
 * 2. Vérifie dans CacheStorage du navigateur.
 * 3. Si absent, télécharge l'extrait 30s légal, l'enregistre en cache local et le renvoie.
 */
export async function getOrFetchAudioPreview(track: Track): Promise<string | null> {
  if (!track || !track.id) return null

  // 1. Déjà créé en URL Blob mémoire
  const inMemory = blobUrlMap.get(track.id)
  if (inMemory) return inMemory

  // Déjà en cours de téléchargement
  const ongoing = fetchingMap.get(track.id)
  if (ongoing) return ongoing

  const fetchPromise = (async (): Promise<string | null> => {
    try {
      // 2. Recherche dans CacheStorage
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(CACHE_NAME)
          const matched = await cache.match(cacheKey(track.id))
          if (matched) {
            const blob = await matched.blob()
            const url = URL.createObjectURL(blob)
            blobUrlMap.set(track.id, url)
            return url
          }
        } catch {
          /* ignore cache error */
        }
      }

      // 3. Recherche de l'extrait audio via iTunes Search API (sans quota, légal, CORS ouvert)
      const query = cleanQuery(track)
      const searchRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`,
      )
      if (!searchRes.ok) return null
      const data = await searchRes.json()
      const previewUrl = data?.results?.[0]?.previewUrl as string | undefined

      if (!previewUrl) return null

      // Téléchargement de l'audio
      const audioRes = await fetch(previewUrl)
      if (!audioRes.ok) return null
      const audioBlob = await audioRes.blob()

      // Enregistrement dans CacheStorage pour les futures écoutes
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(
            cacheKey(track.id),
            new Response(audioBlob, {
              headers: {
                'Content-Type': audioBlob.type || 'audio/m4a',
                'Content-Length': String(audioBlob.size),
              },
            }),
          )
        } catch {
          /* ignore cache store error */
        }
      }

      const localUrl = URL.createObjectURL(audioBlob)
      blobUrlMap.set(track.id, localUrl)
      return localUrl
    } catch {
      return null
    } finally {
      fetchingMap.delete(track.id)
    }
  })()

  fetchingMap.set(track.id, fetchPromise)
  return fetchPromise
}

/**
 * Précharge les morceaux en tâche de fond en arrière-plan (2 par 2).
 */
export function prefetchAudioTracks(tracks: Track[]): void {
  if (!tracks || tracks.length === 0) return
  let idx = 0
  const worker = async () => {
    while (idx < tracks.length) {
      const t = tracks[idx++]
      if (t) {
        try {
          await getOrFetchAudioPreview(t)
        } catch {
          /* ignore */
        }
      }
    }
  }
  worker()
  worker()
}

/**
 * Vide le cache local des sons si besoin.
 */
export async function clearLocalAudioCache(): Promise<void> {
  blobUrlMap.forEach((url) => URL.revokeObjectURL(url))
  blobUrlMap.clear()
  if (typeof caches !== 'undefined') {
    await caches.delete(CACHE_NAME).catch(() => {})
  }
}
