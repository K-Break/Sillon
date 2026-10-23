import { useState } from 'react'
import { TIERS, finalOrder, tierIsRefined, type EngineState } from '../engine'
import type { Track } from '../types'
import { Cover } from './Cover'
import { ExternalIcon } from './icons'

interface Props {
  engine: EngineState
  tracks: Map<string, Track>
  sourceName: string
  demo: boolean
  onSave: (name: string) => Promise<string>
  onRestart: () => void
}

export function Result({ engine, tracks, sourceName, demo, onSave, onRestart }: Props) {
  const ranked = finalOrder(engine)
  const [name, setName] = useState(`${sourceName} · classée`)
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      setSavedUrl(await onSave(name.trim() || 'Classement Sillon'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    const text = ranked
      .map((r, i) => {
        const t = tracks.get(r.id)
        return t ? `${i + 1}. ${t.name} — ${t.artists}` : ''
      })
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Copie impossible depuis ce navigateur.')
    }
  }

  let rank = 0
  return (
    <section className="result">
      <div className="result-list">
        <h2>Ton classement</h2>
        <p className="lead">
          {ranked.length} sons{engine.duels > 0 ? ` · ${engine.duels} duels` : ''}
        </p>
        {TIERS.map((label, t) => {
          const items = ranked.filter((r) => r.tier === t)
          if (items.length === 0) return null
          return (
            <div className="result-tier" key={label}>
              <div className="result-tier-head">
                <h3>{label}</h3>
                <span>
                  {items.length}
                  {!tierIsRefined(engine, t) && ' · ordre approximatif'}
                </span>
              </div>
              <ol>
                {items.map((r) => {
                  const track = tracks.get(r.id)
                  if (!track) return null
                  rank++
                  return (
                    <li key={r.id} className="result-row" style={{ animationDelay: `${Math.min(rank, 20) * 24}ms` }}>
                      <span className="rank">{rank}</span>
                      <span className="thumb">
                        <Cover track={track} />
                      </span>
                      <span className="row-text">
                        <strong>{track.name}</strong>
                        <small>{track.artists}</small>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          )
        })}
      </div>

      <aside className="result-side">
        <div className="panel">
          <h3>Enregistrer dans Spotify</h3>
          {savedUrl ? (
            <>
              <p className="saved">Playlist créée dans ton compte, en privé.</p>
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
              <p className="hint">Une nouvelle playlist privée est créée. Tes playlists existantes ne sont pas modifiées.</p>
            </>
          )}
          {error && <p className="error-text">{error}</p>}
        </div>
        <div className="side-actions stack">
          <button className="btn" onClick={copy}>
            {copied ? 'Copié' : 'Copier la liste'}
          </button>
          <button className="btn ghost" onClick={onRestart}>
            Nouveau tri
          </button>
        </div>
      </aside>
    </section>
  )
}
