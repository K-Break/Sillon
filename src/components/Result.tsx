import { useState } from 'react'
import { finalOrder, tierIsRefined, type EngineState, type Ranked } from '../engine'
import type { Track } from '../types'
import type { PlaybackState } from '../spotify/player'
import { PlayCover } from './Cover'
import { ArrowDownIcon, ArrowUpIcon, ExternalIcon, GridIcon, ListIcon, UndoIcon } from './icons'

export const TIER_CONFIG = [
  { letter: 'S', label: 'Incontournable', color: '#ff7f7f', text: '#111111' },
  { letter: 'A', label: 'Très bon', color: '#ffbf7f', text: '#111111' },
  { letter: 'B', label: 'Bon', color: '#ffdf7f', text: '#111111' },
  { letter: 'C', label: 'Passable', color: '#bfff7f', text: '#111111' },
  { letter: 'D', label: 'Faible', color: '#7fbfff', text: '#111111' },
] as const

interface Props {
  engine: EngineState
  tracks: Map<string, Track>
  sourceName: string
  demo: boolean
  playback: PlaybackState
  onPressTrack: (t: Track) => void
  onSave: (name: string, customOrder?: string[]) => Promise<string>
  onRestart: () => void
}

export function Result({
  engine,
  tracks,
  sourceName,
  demo,
  playback,
  onPressTrack,
  onSave,
  onRestart,
}: Props) {
  const initialRanked = finalOrder(engine)
  const [order, setOrder] = useState<Ranked[]>(initialRanked)
  const [viewMode, setViewMode] = useState<'tierlist' | 'list'>('tierlist')
  const [name, setName] = useState(`${sourceName} · classée`)
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverTier, setDragOverTier] = useState<number | null>(null)
  const [hoveredTrack, setHoveredTrack] = useState<Track | null>(null)

  const hasCustomEdits = JSON.stringify(order) !== JSON.stringify(initialRanked)

  const moveTrack = (trackId: string, toTier: number, targetIndexInTier?: number) => {
    setOrder((prev) => {
      const current = prev.find((r) => r.id === trackId)
      if (!current) return prev

      const rest = prev.filter((r) => r.id !== trackId)
      const inTier = rest.filter((r) => r.tier === toTier)
      const insertAt =
        targetIndexInTier !== undefined
          ? Math.max(0, Math.min(inTier.length, targetIndexInTier))
          : inTier.length

      const updated = { id: trackId, tier: toTier }
      inTier.splice(insertAt, 0, updated)

      const nextOrder: Ranked[] = []
      for (let t = 0; t < 5; t++) {
        if (t === toTier) {
          nextOrder.push(...inTier)
        } else {
          nextOrder.push(...rest.filter((r) => r.tier === t))
        }
      }
      return nextOrder
    })
  }

  const moveRelative = (trackId: string, direction: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.findIndex((r) => r.id === trackId)
      if (idx === -1) return prev
      const item = prev[idx]
      const currentTier = item.tier
      const itemsInTier = prev.filter((r) => r.tier === currentTier)
      const idxInTier = itemsInTier.findIndex((r) => r.id === trackId)

      // Vers le haut
      if (direction === -1) {
        if (idxInTier > 0) {
          return swapInTier(prev, currentTier, idxInTier, idxInTier - 1)
        } else if (currentTier > 0) {
          // Remonte dans le palier supérieur
          return moveTrackToTier(prev, trackId, currentTier - 1, 'end')
        }
      } else {
        // Vers le bas
        if (idxInTier < itemsInTier.length - 1) {
          return swapInTier(prev, currentTier, idxInTier, idxInTier + 1)
        } else if (currentTier < 4) {
          // Descend dans le palier inférieur
          return moveTrackToTier(prev, trackId, currentTier + 1, 'start')
        }
      }
      return prev
    })
  }

  const changeTier = (trackId: string, newTier: number) => {
    moveTrack(trackId, newTier)
  }

  const resetToDefault = () => {
    setOrder(initialRanked)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const customIds = order.map((r) => r.id)
      setSavedUrl(await onSave(name.trim() || 'Classement Sillon', customIds))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    let rank = 1
    const text = order
      .map((r) => {
        const t = tracks.get(r.id)
        if (!t) return ''
        const tierLetter = TIER_CONFIG[r.tier]?.letter ?? '?'
        return `[${tierLetter}] ${rank++}. ${t.name} — ${t.artists}`
      })
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Copie impossible depuis ce navigateur.')
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, trackId: string) => {
    setDraggedId(trackId)
    e.dataTransfer.setData('text/plain', trackId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOverTier = (e: React.DragEvent, tierIndex: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverTier !== tierIndex) {
      setDragOverTier(tierIndex)
    }
  }

  const handleDropOnTier = (e: React.DragEvent, tierIndex: number) => {
    e.preventDefault()
    const trackId = e.dataTransfer.getData('text/plain') || draggedId
    if (trackId) {
      moveTrack(trackId, tierIndex)
    }
    setDraggedId(null)
    setDragOverTier(null)
  }

  const handleDropOnItem = (e: React.DragEvent, targetTrackId: string, tierIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    const trackId = e.dataTransfer.getData('text/plain') || draggedId
    if (trackId && trackId !== targetTrackId) {
      const itemsInTier = order.filter((r) => r.tier === tierIndex)
      const targetIdx = itemsInTier.findIndex((r) => r.id === targetTrackId)
      moveTrack(trackId, tierIndex, targetIdx)
    }
    setDraggedId(null)
    setDragOverTier(null)
  }

  let globalRank = 0

  return (
    <section className="result">
      <div className="result-main-col">
        <div className="result-header-row">
          <div>
            <h2>Ton classement</h2>
            <p className="lead">
              {order.length} sons{engine.duels > 0 ? ` · ${engine.duels} duels` : ''}
              {hasCustomEdits && <span className="edited-badge"> · Personnalisé</span>}
            </p>
          </div>

          <div className="result-view-controls">
            <div className="view-mode-toggle" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'tierlist'}
                className={`view-mode-btn${viewMode === 'tierlist' ? ' active' : ''}`}
                onClick={() => setViewMode('tierlist')}
                title="Affichage grille Tier List S·A·B·C·D"
              >
                <GridIcon size={16} />
                <span>Tier List</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'list'}
                className={`view-mode-btn${viewMode === 'list' ? ' active' : ''}`}
                onClick={() => setViewMode('list')}
                title="Affichage liste numérotée"
              >
                <ListIcon size={16} />
                <span>Liste</span>
              </button>
            </div>

            {hasCustomEdits && (
              <button className="btn ghost mini-btn reset-btn" onClick={resetToDefault} title="Réinitialiser l'ordre">
                <UndoIcon size={14} /> Réinitialiser
              </button>
            )}
          </div>
        </div>

        {/* MODE 1 : GRILLE TIER LIST VISUELLE (S A B C D) */}
        {viewMode === 'tierlist' && (
          <div className="tierlist-board" role="region" aria-label="Tier List S A B C D">
            {TIER_CONFIG.map((tier, t) => {
              const itemsInTier = order.filter((r) => r.tier === t)
              return (
                <div
                  key={tier.letter}
                  className={`tierlist-row${dragOverTier === t ? ' is-drag-over' : ''}`}
                  onDragOver={(e) => handleDragOverTier(e, t)}
                  onDragLeave={() => setDragOverTier(null)}
                  onDrop={(e) => handleDropOnTier(e, t)}
                >
                  <div
                    className="tierlist-label-box"
                    style={{ backgroundColor: tier.color, color: tier.text }}
                    title={`${tier.letter} : ${tier.label}`}
                  >
                    <span className="tierlist-letter">{tier.letter}</span>
                    <span className="tierlist-sublabel">{tier.label}</span>
                  </div>

                  <div className="tierlist-items-container">
                    {itemsInTier.length === 0 ? (
                      <div className="tierlist-empty-slot">Glisse un son ici</div>
                    ) : (
                      itemsInTier.map((item, idxInTier) => {
                        const track = tracks.get(item.id)
                        if (!track) return null
                        const isDragging = draggedId === item.id
                        return (
                          <div
                            key={item.id}
                            className={`tierlist-tile${isDragging ? ' is-dragging' : ''}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, item.id)}
                            onDragEnd={() => {
                              setDraggedId(null)
                              setDragOverTier(null)
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDropOnItem(e, item.id, t)}
                            onMouseEnter={() => setHoveredTrack(track)}
                            onMouseLeave={() => setHoveredTrack(null)}
                          >
                            <PlayCover
                              track={track}
                              state={playback}
                              onPress={() => onPressTrack(track)}
                              label={track.name}
                            />
                            <div className="tierlist-tile-hover-bar">
                              <button
                                type="button"
                                className="tile-arrow-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  moveRelative(item.id, -1)
                                }}
                                title="Monter"
                              >
                                <ArrowUpIcon size={12} />
                              </button>
                              <button
                                type="button"
                                className="tile-arrow-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  moveRelative(item.id, 1)
                                }}
                                title="Descendre"
                              >
                                <ArrowDownIcon size={12} />
                              </button>
                            </div>
                            <span className="tierlist-tile-rank-badge">#{idxInTier + 1}</span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Hover preview tooltip if in Tier List mode */}
        {viewMode === 'tierlist' && hoveredTrack && (
          <div className="tierlist-hover-info">
            <strong>{hoveredTrack.name}</strong>
            <span>{hoveredTrack.artists}</span>
          </div>
        )}

        {/* MODE 2 : LISTE NUMÉROTÉE CLASSIQUE */}
        {viewMode === 'list' && (
          <div className="result-list-view">
            {TIER_CONFIG.map((tier, t) => {
              const itemsInTier = order.filter((r) => r.tier === t)
              if (itemsInTier.length === 0) return null
              return (
                <div
                  className={`result-tier-group${dragOverTier === t ? ' is-drag-over' : ''}`}
                  key={tier.letter}
                  onDragOver={(e) => handleDragOverTier(e, t)}
                  onDragLeave={() => setDragOverTier(null)}
                  onDrop={(e) => handleDropOnTier(e, t)}
                >
                  <div className="result-tier-head">
                    <div className="result-tier-title-wrap">
                      <span className="result-tier-pill" style={{ backgroundColor: tier.color, color: tier.text }}>
                        {tier.letter}
                      </span>
                      <h3>{tier.label}</h3>
                    </div>
                    <span>
                      {itemsInTier.length} son{itemsInTier.length > 1 ? 's' : ''}
                      {!tierIsRefined(engine, t) && ' · affiné'}
                    </span>
                  </div>

                  <ol className="result-numbered-ol">
                    {itemsInTier.map((item) => {
                      const track = tracks.get(item.id)
                      if (!track) return null
                      globalRank++
                      const isDragging = draggedId === item.id
                      return (
                        <li
                          key={item.id}
                          className={`result-row${isDragging ? ' is-dragging' : ''}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, item.id)}
                          onDragEnd={() => {
                            setDraggedId(null)
                            setDragOverTier(null)
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleDropOnItem(e, item.id, t)}
                        >
                          <span className="rank">{globalRank}</span>
                          <span className="thumb">
                            <PlayCover
                              track={track}
                              state={playback}
                              onPress={() => onPressTrack(track)}
                              label={track.name}
                            />
                          </span>
                          <div className="row-text">
                            <strong>{track.name}</strong>
                            <small>{track.artists}</small>
                          </div>
                          <div className="row-reorder-actions">
                            <button
                              type="button"
                              className="reorder-btn"
                              onClick={() => moveRelative(item.id, -1)}
                              title="Déplacer vers le haut"
                            >
                              <ArrowUpIcon size={14} />
                            </button>
                            <button
                              type="button"
                              className="reorder-btn"
                              onClick={() => moveRelative(item.id, 1)}
                              title="Déplacer vers le bas"
                            >
                              <ArrowDownIcon size={14} />
                            </button>
                            <select
                              className="tier-select-dropdown"
                              value={t}
                              onChange={(e) => changeTier(item.id, Number(e.target.value))}
                              title="Changer de palier"
                            >
                              {TIER_CONFIG.map((cfg, idx) => (
                                <option key={cfg.letter} value={idx}>
                                  {cfg.letter} - {cfg.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <aside className="result-side">
        <div className="panel">
          <h3>Enregistrer dans Spotify</h3>
          {savedUrl ? (
            <>
              <p className="saved">Playlist créée dans ton compte avec ton ordre personnalisé !</p>
              <a className="btn primary block" href={savedUrl} target="_blank" rel="noreferrer">
                Ouvrir dans Spotify <ExternalIcon size={16} />
              </a>
            </>
          ) : (
            <>
              <label className="label" htmlFor="pl-name">
                Nom de la playlist
              </label>
              <input id="pl-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn primary block" onClick={save} disabled={saving || demo}>
                {saving ? 'Création en cours…' : 'Créer la playlist'}
              </button>
              {demo && <p className="hint">Disponible une fois connecté à Spotify.</p>}
              <p className="hint">Une nouvelle playlist privée est créée dans l'ordre de ton récapitulatif.</p>
            </>
          )}
          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="side-actions stack">
          <button className="btn" onClick={copy}>
            {copied ? 'Copié !' : 'Copier la liste'}
          </button>
          <button className="btn ghost" onClick={onRestart}>
            Nouveau tri
          </button>
        </div>
      </aside>
    </section>
  )
}

function swapInTier(list: Ranked[], tier: number, idxA: number, idxB: number): Ranked[] {
  const inTier = list.filter((r) => r.tier === tier)
  if (idxA < 0 || idxA >= inTier.length || idxB < 0 || idxB >= inTier.length) return list
  const temp = inTier[idxA]
  inTier[idxA] = inTier[idxB]
  inTier[idxB] = temp

  const out: Ranked[] = []
  for (let t = 0; t < 5; t++) {
    if (t === tier) out.push(...inTier)
    else out.push(...list.filter((r) => r.tier === t))
  }
  return out
}

function moveTrackToTier(list: Ranked[], trackId: string, targetTier: number, pos: 'start' | 'end'): Ranked[] {
  const rest = list.filter((r) => r.id !== trackId)
  const inTier = rest.filter((r) => r.tier === targetTier)
  const item: Ranked = { id: trackId, tier: targetTier }

  if (pos === 'start') inTier.unshift(item)
  else inTier.push(item)

  const out: Ranked[] = []
  for (let t = 0; t < 5; t++) {
    if (t === targetTier) out.push(...inTier)
    else out.push(...rest.filter((r) => r.tier === t))
  }
  return out
}
