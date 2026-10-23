import { useEffect, useState } from 'react'
import { TIERS, remainingDuels, type EngineState } from '../engine'

interface Props {
  engine: EngineState
  canUndo: boolean
  onRefine: () => void
  onSkipRefine: () => void
  onUndo: () => void
}

export function Between({ engine, canUndo, onRefine, onSkipRefine, onUndo }: Props) {
  const counts = engine.buckets.map((b) => b.length)
  const max = Math.max(...counts, 1)
  const duels = remainingDuels(engine)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(t)
  }, [])

  return (
    <section className="between">
      <h2>Premier tri terminé</h2>
      <p className="lead">Voici comment se répartissent tes {engine.ids.length} sons.</p>
      <div className="dist">
        {TIERS.map((label, i) => (
          <div className="dist-row" key={label}>
            <span className="dist-label">{label}</span>
            <span className="dist-bar">
              <i style={{ transform: `scaleX(${shown ? counts[i] / max : 0})`, transitionDelay: `${i * 70}ms` }} />
            </span>
            <span className="dist-count">{counts[i]}</span>
          </div>
        ))}
      </div>
      <p className="explain">
        {duels > 0 ? (
          <>
            Affiner l'ordre demande environ <strong>{duels} duels</strong>. Tu peux t'arrêter quand tu veux : on commence
            par le haut de ta liste, donc ce qui compte le plus est classé en premier.
          </>
        ) : (
          <>Chaque palier ne contient qu'un son ou aucun : il n'y a rien à départager.</>
        )}
      </p>
      <div className="actions">
        {duels > 0 && (
          <button className="btn primary" onClick={onRefine}>
            Affiner l'ordre
          </button>
        )}
        <button className="btn" onClick={onSkipRefine}>
          {duels > 0 ? 'Voir le résultat tel quel' : 'Voir le résultat'}
        </button>
        <button className="btn ghost" onClick={onUndo} disabled={!canUndo}>
          Annuler le dernier choix
        </button>
      </div>
    </section>
  )
}
