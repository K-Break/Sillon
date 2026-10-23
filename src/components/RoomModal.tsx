import { useState } from 'react'
import type { Participant } from '../multiplayer/types'
import { PLAYER_COLORS } from '../multiplayer/identity'
import { CloseIcon } from './icons'

interface Props {
  isOpen: boolean
  roomId: string | null
  myId: string
  participants: Participant[]
  isHost: boolean
  defaultName: string
  onClose: () => void
  onCreate: (code?: string) => void
  onJoin: (code: string, asHost?: boolean, name?: string, color?: string) => void
  onLeave: () => void
  onReaction: (emoji: string) => void
}

const EMOJIS = ['🔥', '🎵', '🤯', '👏', '❤️', '👀', '💀', '🎉']

export function RoomModal({
  isOpen,
  roomId,
  myId,
  participants,
  isHost,
  defaultName,
  onClose,
  onCreate,
  onJoin,
  onLeave,
  onReaction,
}: Props) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [inputCode, setInputCode] = useState('')
  const [customName, setCustomName] = useState(defaultName)
  const [selectedColor, setSelectedColor] = useState(PLAYER_COLORS[0])
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const shareUrl = roomId
    ? `${window.location.origin}${window.location.pathname}?room=${roomId}`
    : ''

  const copyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="live-dot" />
            <h2>{roomId ? `Salle multijoueur · ${roomId}` : 'Multijoueur en direct'}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <CloseIcon size={18} />
          </button>
        </div>

        {roomId ? (
          /* Active Room Screen */
          <div className="modal-body room-active-body">
            <div className="share-box">
              <label className="label">Lien d'invitation à partager avec tes amis</label>
              <div className="share-input-row">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="input share-input"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button className="btn primary" onClick={copyLink}>
                  {copied ? 'Copié !' : 'Copier'}
                </button>
              </div>
              <p className="hint">
                Chaque ami qui ouvre ce lien rejoindra ta salle immédiatement. Ils n'ont pas besoin de compte Spotify pour
                voter !
              </p>
            </div>

            {/* Quick Reactions Bar */}
            <div className="reaction-bar">
              <span className="reaction-label">Envoyer une réaction :</span>
              <div className="reaction-buttons">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className="reaction-btn"
                    onClick={() => onReaction(emoji)}
                    title={`Envoyer ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Participant List */}
            <div className="participants-box">
              <div className="participants-head">
                <h3>Joueurs connectés ({participants.length})</h3>
                <span className="live-pill">En direct</span>
              </div>
              <ul className="participant-list">
                {participants.map((p) => {
                  const isMe = p.id === myId
                  return (
                    <li key={p.id} className={`participant-item${isMe ? ' me' : ''}`}>
                      <div className="participant-avatar" style={{ backgroundColor: p.color }}>
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="participant-info">
                        <span className="participant-name">
                          {p.name} {isMe && <small className="tag-me">(toi)</small>}
                        </span>
                        <div className="participant-badges">
                          {p.isHost && <span className="badge host">Hôte</span>}
                          {p.hasSpotify ? (
                            <span className="badge spotify">Spotify Premium</span>
                          ) : (
                            <span className="badge guest">Invité (vote seul)</span>
                          )}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="modal-actions space-between">
              <button className="btn danger-ghost" onClick={onLeave}>
                Quitter la salle
              </button>
              <button className="btn" onClick={onClose}>
                Retour au jeu
              </button>
            </div>
          </div>
        ) : (
          /* Create or Join Room Screen */
          <div className="modal-body">
            <div className="segmented tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === 'create'}
                onClick={() => setTab('create')}
              >
                Créer une salle
              </button>
              <button
                role="tab"
                aria-selected={tab === 'join'}
                onClick={() => setTab('join')}
              >
                Rejoindre une salle
              </button>
            </div>

            <div className="profile-edit-box">
              <label className="label" htmlFor="mp-pseudo">
                Ton pseudo
              </label>
              <input
                id="mp-pseudo"
                className="input"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Ex : Kevin"
              />

              <label className="label">Ta couleur de curseur</label>
              <div className="color-swatches">
                {PLAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch${selectedColor === c ? ' selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setSelectedColor(c)}
                    aria-label={`Choisir la couleur ${c}`}
                  />
                ))}
              </div>
            </div>

            {tab === 'create' ? (
              <div className="tab-pane">
                <p className="lead">
                  Crée une salle multijoueur : un lien unique sera généré. Tes amis verront tes choix, vos souris bouger
                  en direct, et voteront ensemble à la majorité !
                </p>
                <div className="modal-actions">
                  <button
                    className="btn primary block"
                    onClick={() => {
                      onCreate()
                    }}
                  >
                    Lancer la salle multijoueur
                  </button>
                </div>
              </div>
            ) : (
              <div className="tab-pane">
                <label className="label" htmlFor="room-code-input">
                  Code de la salle
                </label>
                <input
                  id="room-code-input"
                  className="input code-input"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="Ex : GROOV42"
                  maxLength={10}
                />
                <div className="modal-actions">
                  <button
                    className="btn primary block"
                    disabled={!inputCode.trim()}
                    onClick={() => {
                      onJoin(inputCode.trim(), false, customName, selectedColor)
                    }}
                  >
                    Rejoindre la partie
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
