import type { Participant } from '../multiplayer/types'

interface Props {
  roomCode: string
  hostName: string
  participants: Participant[]
  myId: string
  onLeave: () => void
  onReaction: (emoji: string) => void
}

const EMOJIS = ['🔥', '🎵', '🤯', '👏', '❤️', '👀', '🎉', '⚡']

export function Lobby({
  roomCode,
  hostName,
  participants,
  myId,
  onLeave,
  onReaction,
}: Props) {
  return (
    <section className="lobby-stage">
      <div className="lobby-card">
        <div className="lobby-badge">
          <span className="live-dot" />
          <span>Salle {roomCode} · Salon d'attente</span>
        </div>

        <div className="lobby-vinyl" aria-hidden="true">
          <div className="vinyl-groove">
            <div className="vinyl-center">
              <span className="live-dot" />
            </div>
          </div>
        </div>

        <div className="lobby-header-text">
          <h2>Préparez-vous !</h2>
          <p className="lead">
            <strong>{hostName || 'Le chef du groupe'}</strong> choisit la playlist. La partie commencera automatiquement
            pour tout le monde dès qu'il aura lancé le tri.
          </p>
        </div>

        {/* Reactions in Lobby */}
        <div className="lobby-reactions">
          <span className="hint">Envoyer une réaction en direct :</span>
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

        {/* Players list */}
        <div className="lobby-players">
          <div className="lobby-players-head">
            <h3>Joueurs connectés ({participants.length})</h3>
            <span className="live-pill">
              <span className="live-dot" /> En direct
            </span>
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
                      {p.isHost && <span className="badge host">Chef de groupe</span>}
                      {p.hasSpotify ? (
                        <span className="badge spotify">Spotify Premium</span>
                      ) : (
                        <span className="badge guest">Invité (vote)</span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="lobby-actions">
          <button className="btn danger-ghost" onClick={onLeave}>
            Quitter la salle
          </button>
        </div>
      </div>
    </section>
  )
}
