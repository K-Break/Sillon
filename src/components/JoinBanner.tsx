import { useState } from 'react'
import { PLAYER_COLORS } from '../multiplayer/identity'

interface Props {
  roomCode: string
  defaultName: string
  onJoin: (name: string, color: string) => void
  onDecline: () => void
}

export function JoinBanner({ roomCode, defaultName, onJoin, onDecline }: Props) {
  const [name, setName] = useState(defaultName)
  const [color, setColor] = useState(PLAYER_COLORS[0])

  return (
    <div className="join-modal-backdrop" role="dialog" aria-modal="true">
      <div className="join-modal-card">
        <div className="join-badge">
          <span className="live-dot" />
          <span>Partie multijoueur</span>
        </div>
        <h2>Rejoindre la salle {roomCode}</h2>
        <p className="lead">
          Tu as été invité à trier une playlist avec tes amis ! Tu vas voir toutes leurs souris en direct et voter à chaque
          duel.
        </p>

        <div className="join-form">
          <label className="label" htmlFor="join-name-input">
            Ton pseudo pour la partie
          </label>
          <input
            id="join-name-input"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Entre ton prénom ou pseudo"
            autoFocus
          />

          <label className="label">Choisis ta couleur de curseur</label>
          <div className="color-swatches">
            {PLAYER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-swatch${color === c ? ' selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          <div className="join-actions">
            <button
              className="btn primary block"
              disabled={!name.trim()}
              onClick={() => onJoin(name.trim(), color)}
            >
              Rejoindre la partie en direct
            </button>
            <button className="btn ghost block" onClick={onDecline}>
              Ignorer l'invitation
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
