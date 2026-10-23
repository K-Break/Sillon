import { TIERS, duelProgress, tierProgress } from '../engine'
import type { Session } from '../storage'

interface Props {
  configured: boolean
  saved: Session | null
  onLogin: () => void
  onDemo: () => void
  onResume: () => void
  onOpenMultiplayer: () => void
}

export function Welcome({ configured, saved, onLogin, onDemo, onResume, onOpenMultiplayer }: Props) {
  const done = saved
    ? saved.engine.phase === 'tier'
      ? Math.round(tierProgress(saved.engine) * 100)
      : saved.engine.phase === 'done'
        ? 100
        : Math.round(duelProgress(saved.engine) * 100)
    : 0
  const stage = saved
    ? saved.engine.phase === 'done'
      ? 'terminé'
      : saved.engine.phase === 'duel'
        ? `étape 2, ${TIERS[Math.min(saved.engine.tierIdx, TIERS.length - 1)].toLowerCase()}`
        : 'étape 1'
    : ''

  return (
    <section className="welcome">
      <div className="welcome-copy">
        <h1>Classe ta playlist, un duel à la fois.</h1>
        <p className="lead">
          Importe une playlist, écoute deux sons, garde celui que tu préfères. Sillon construit l'ordre à ta place, puis
          l'enregistre dans ton compte Spotify.
        </p>
        <div className="actions">
          {configured ? (
            <button className="btn primary" onClick={onLogin}>
              Se connecter avec Spotify
            </button>
          ) : (
            <p className="notice">
              Ajoute ton Client ID Spotify dans le fichier <code>.env</code> pour te connecter (voir le README).
            </p>
          )}
          <button className="btn" onClick={onDemo}>
            Essayer avec une playlist de démo
          </button>
          <button className="btn mp-trigger-btn" onClick={onOpenMultiplayer}>
            <span className="live-dot" /> Jouer à plusieurs
          </button>
        </div>
        {saved && (
          <button className="resume" onClick={onResume}>
            <span>
              <strong>Reprendre « {saved.sourceName} »</strong>
              <small>
                {saved.tracks.length} sons · {stage} · {done} %
              </small>
            </span>
            <span className="resume-bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${done / 100})` }} />
            </span>
          </button>
        )}
      </div>
      <div className="grooves" aria-hidden="true">
        <span />
      </div>
    </section>
  )
}
