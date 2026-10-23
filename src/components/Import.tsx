import { useEffect, useMemo, useState } from 'react'
import type { PlaylistSummary, Track } from '../types'
import { DEMO_PLAYLISTS, DEMO_TRACKS, searchDemo } from '../demo'
import {
  getMyPlaylists,
  getPlaylistTracks,
  getTracksByIds,
  parseLinks,
  searchTracks,
} from '../spotify/api'
import { useDebounced } from '../hooks'
import { Cover } from './Cover'
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from './icons'

type Tab = 'playlists' | 'search' | 'links'

interface Props {
  demo: boolean
  meId: string | null
  onStart: (tracks: Track[], sourceName: string) => void
  onError: (message: string) => void
  multiplayerInfo?: {
    roomId: string
    isHost: boolean
    participantsCount: number
  }
}

const MIN_TRACKS = 2

export function Import({ demo, meId, onStart, onError, multiplayerInfo }: Props) {
  const [tab, setTab] = useState<Tab>('playlists')
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null)
  const [selected, setSelected] = useState<Track[]>([])
  const [name, setName] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim(), 350)
  const [results, setResults] = useState<Track[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [searching, setSearching] = useState(false)

  const [linkText, setLinkText] = useState('')
  const [linkNote, setLinkNote] = useState<string | null>(null)

  const selectedIds = useMemo(() => new Set(selected.map((t) => t.id)), [selected])

  useEffect(() => {
    if (demo) return setPlaylists(DEMO_PLAYLISTS)
    if (!meId) return
    getMyPlaylists(meId)
      .then((list) => setPlaylists([...list.filter((p) => p.readable), ...list.filter((p) => !p.readable)]))
      .catch((e: Error) => onError(e.message))
  }, [demo, meId, onError])

  useEffect(() => {
    if (!debounced) {
      setResults([])
      setHasMore(false)
      return
    }
    let alive = true
    setSearching(true)
    const run = demo
      ? Promise.resolve({ tracks: searchDemo(debounced), hasMore: false })
      : searchTracks(debounced, 0)
    run
      .then((r) => {
        if (!alive) return
        setResults(r.tracks)
        setHasMore(r.hasMore)
      })
      .catch((e: Error) => alive && onError(e.message))
      .finally(() => alive && setSearching(false))
    return () => {
      alive = false
    }
  }, [debounced, demo, onError])

  const loadMore = async () => {
    setSearching(true)
    try {
      const r = await searchTracks(debounced, results.length)
      setResults((prev) => [...prev, ...r.tracks.filter((t) => !prev.some((p) => p.id === t.id))])
      setHasMore(r.hasMore)
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  const addTracks = (list: Track[], source?: string) => {
    setSelected((prev) => {
      const have = new Set(prev.map((t) => t.id))
      return [...prev, ...list.filter((t) => !have.has(t.id))]
    })
    if (source && !name) setName(source)
  }

  const addPlaylist = async (p: PlaylistSummary) => {
    if (busy || added.has(p.id) || !p.readable) return
    setBusy(p.id)
    try {
      const list = demo ? DEMO_TRACKS : await getPlaylistTracks(p.id)
      addTracks(list, p.name)
      setAdded((s) => new Set(s).add(p.id))
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const addLinks = async () => {
    const { trackIds, playlistIds } = parseLinks(linkText)
    if (trackIds.length + playlistIds.length === 0) {
      setLinkNote("Aucun lien Spotify reconnu. Colle des liens de sons ou d'une de tes playlists.")
      return
    }
    setBusy('links')
    setLinkNote(null)
    let ok = 0
    let skipped = 0
    try {
      if (demo) {
        setLinkNote('Les liens ne sont pas disponibles en mode démo.')
        return
      }
      for (const id of playlistIds) {
        try {
          const list = await getPlaylistTracks(id)
          addTracks(list)
          ok += list.length
        } catch {
          skipped++
        }
      }
      const known = new Set(selected.map((t) => t.id))
      const tracks = await getTracksByIds(trackIds.filter((id) => !known.has(id)))
      addTracks(tracks)
      ok += tracks.length
      skipped += trackIds.filter((id) => !known.has(id)).length - tracks.length
      setLinkText('')
      setLinkNote(
        `${ok} son${ok > 1 ? 's' : ''} ajouté${ok > 1 ? 's' : ''}` +
          (skipped ? `, ${skipped} lien${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''} (illisible ou playlist qui ne t'appartient pas).` : '.'),
      )
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const remove = (id: string) => setSelected((s) => s.filter((t) => t.id !== id))
  const canStart = selected.length >= MIN_TRACKS

  return (
    <section className="import">
      {multiplayerInfo && (
        <div className="host-room-banner">
          <div className="host-banner-pill">
            <span className="live-dot" />
            <span>Salle {multiplayerInfo.roomId} · {multiplayerInfo.isHost ? '👑 Chef du groupe' : 'Membre'}</span>
          </div>
          <p className="lead" style={{ margin: '4px 0 0', fontSize: '14px' }}>
            {multiplayerInfo.isHost ? (
              <>
                Tu es le chef du groupe ! Choisis la playlist ci-dessous : dès que tu cliques sur <strong>« Lancer le tri »</strong>,
                la partie débutera automatiquement pour tous les joueurs (<strong>{multiplayerInfo.participantsCount} connecté{multiplayerInfo.participantsCount > 1 ? 's' : ''}</strong>).
              </>
            ) : (
              <>En attente que le chef du groupe lance la partie...</>
            )}
          </p>
        </div>
      )}

      <div className="import-sources">
        <h2>Choisis tes sons</h2>
        <div className="tabs" role="tablist">
          {(
            [
              ['playlists', 'Mes playlists'],
              ['search', 'Rechercher'],
              ['links', 'Coller des liens'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className="tab" onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'playlists' && (
          <div className="list" role="tabpanel">
            {playlists === null && <p className="empty">Chargement de tes playlists…</p>}
            {playlists?.length === 0 && <p className="empty">Aucune playlist trouvée sur ce compte.</p>}
            {playlists?.map((p) => (
              <button
                key={p.id}
                className="row"
                disabled={!p.readable || added.has(p.id)}
                onClick={() => addPlaylist(p)}
                title={p.readable ? undefined : "Spotify ne permet plus de lire le contenu d'une playlist qui ne t'appartient pas."}
              >
                <span className="thumb">
                  <Cover track={{ id: p.id, image: p.image }} />
                </span>
                <span className="row-text">
                  <strong>{p.name}</strong>
                  <small>
                    {p.readable ? `${p.total} sons` : 'Lecture non autorisée par Spotify'}
                  </small>
                </span>
                <span className="row-end">
                  {busy === p.id ? <span className="spinner" /> : added.has(p.id) ? <CheckIcon /> : p.readable && <PlusIcon />}
                </span>
              </button>
            ))}
            {playlists?.some((p) => !p.readable) && (
              <p className="hint">
                Pour classer la playlist de quelqu'un d'autre, copie ses sons dans une de tes playlists, ou colle leurs
                liens dans l'onglet suivant.
              </p>
            )}
          </div>
        )}

        {tab === 'search' && (
          <div role="tabpanel">
            <label className="field">
              <SearchIcon size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Titre ou artiste"
                autoFocus
              />
            </label>
            <div className="list">
              {debounced && !searching && results.length === 0 && <p className="empty">Aucun résultat.</p>}
              {results.map((t) => (
                <TrackRow key={t.id} track={t} added={selectedIds.has(t.id)} onAdd={() => addTracks([t])} />
              ))}
              {hasMore && (
                <button className="btn ghost more" onClick={loadMore} disabled={searching}>
                  Plus de résultats
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'links' && (
          <div role="tabpanel" className="links">
            <textarea
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="Colle ici des liens de sons Spotify, un par ligne (ou une sélection copiée depuis l'app Spotify)."
              rows={7}
            />
            <div className="links-actions">
              <button className="btn" onClick={addLinks} disabled={busy === 'links' || !linkText.trim()}>
                {busy === 'links' ? 'Ajout en cours…' : 'Ajouter ces sons'}
              </button>
              {linkNote && <span className="note">{linkNote}</span>}
            </div>
          </div>
        )}
      </div>

      <aside className="import-selection">
        <div className="selection-head">
          <h2>Ta sélection</h2>
          <span className="count-pill">{selected.length}</span>
        </div>
        <div className="list selection-list">
          {selected.length === 0 && <p className="empty">Ajoute au moins {MIN_TRACKS} sons pour commencer.</p>}
          {selected.map((t) => (
            <div key={t.id} className="row static">
              <span className="thumb">
                <Cover track={t} />
              </span>
              <span className="row-text">
                <strong>{t.name}</strong>
                <small>{t.artists}</small>
              </span>
              <button className="icon-btn" onClick={() => remove(t.id)} aria-label={`Retirer ${t.name}`}>
                <CloseIcon size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="selection-foot">
          <button
            className="btn primary block"
            disabled={!canStart}
            onClick={() => onStart(selected, name ?? 'Ma sélection')}
          >
            Commencer le tri{selected.length > 0 ? ` · ${selected.length} sons` : ''}
          </button>
        </div>
      </aside>
    </section>
  )
}

function TrackRow({ track, added, onAdd }: { track: Track; added: boolean; onAdd: () => void }) {
  return (
    <button className="row" disabled={added} onClick={onAdd}>
      <span className="thumb">
        <Cover track={track} />
      </span>
      <span className="row-text">
        <strong>{track.name}</strong>
        <small>{track.artists}</small>
      </span>
      <span className="row-end">{added ? <CheckIcon /> : <PlusIcon />}</span>
    </button>
  )
}
