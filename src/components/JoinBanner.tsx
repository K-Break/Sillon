import { useState } from 'react'
import { PLAYER_COLORS } from '../multiplayer/identity'

interface Props {
  roomCode: string
  spotifyUser: { id: string; name: string } | null
  defaultName: string
  onJoin: (name: string, color: string) => void
  onLoginWithSpotify: () => void
  onDecline: () => void
}

export function JoinBanner({
  roomCode,
  spotifyUser,
  defaultName,
  onJoin,
  onLoginWithSpotify,
  onDecline,
}: Props) {
  const [name, setName] = useState(spotifyUser?.name || defaultName)
  const [color, setColor] = useState(PLAYER_COLORS[0])
  const [customMode, setCustomMode] = useState(!spotifyUser)

  const isConnected = Boolean(spotifyUser)

  return (
    <div className="join-modal-backdrop" role="dialog" aria-modal="true">
      <div className="join-modal-card">
        <div className="join-badge">
          <span className="live-dot" />
          <span>Partie multijoueur</span>
        </div>

        <h2>Rejoindre la salle {roomCode}</h2>

        {isConnected ? (
          /* User is already connected to Spotify */
          <div className="join-connected-flow">
            <div className="spotify-connected-badge">
              <span className="badge spotify">Spotify connecté</span>
              <strong>{spotifyUser!.name}</strong>
            </div>

            {!customMode ? (
              <>
                <p className="lead">
                  Tu vas rejoindre la partie avec ton compte Spotify. Tu pourras écouter la musique sur tes écouteurs et voter
                  en direct avec tes amis.
                </p>

                <label className="label">Ta couleur de curseur</label>
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
                    onClick={() => onJoin(spotifyUser!.name, color)}
                  >
                    Rejoindre en tant que {spotifyUser!.name}
                  </button>
                  <button
                    type="button"
                    className="btn ghost block"
                    onClick={() => setCustomMode(true)}
                    style={{ fontSize: '13px' }}
                  >
                    Modifier mon pseudo pour cette partie
                  </button>
                  <button className="btn ghost block" onClick={onDecline}>
                    Ignorer l'invitation
                  </button>
                </div>
              </>
            ) : (
              <div className="join-form">
                <label className="label" htmlFor="custom-name-input">
                  Ton pseudo personnalisé
                </label>
                <input
                  id="custom-name-input"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex : Kevin"
                  autoFocus
                />

                <label className="label">Ta couleur de curseur</label>
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
                    Rejoindre en tant que {name.trim() || '...'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost block"
                    onClick={() => {
                      setName(spotifyUser!.name)
                      setCustomMode(false)
                    }}
                    style={{ fontSize: '13px' }}
                  >
                    Revenir à mon pseudo Spotify ({spotifyUser!.name})
                  </button>
                  <button className="btn ghost block" onClick={onDecline}>
                    Ignorer l'invitation
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* User is NOT connected to Spotify yet */
          <div className="join-unconnected-flow">
            <p className="lead">
              Tu as été invité à trier une playlist à plusieurs. Choisis comment tu souhaites participer :
            </p>

            {/* Option 1: Guest Mode */}
            <div className="join-option-card">
              <div className="option-title">
                <span className="badge guest">Option 1</span>
                <strong>Rejoindre en mode invité (rapide, sans compte)</strong>
              </div>
              <p className="hint">
                Tu n'as pas besoin de compte Spotify. Tu verras les sons, les curseurs de tout le monde et tu voteras à
                chaque duel !
              </p>

              <div className="join-form">
                <label className="label" htmlFor="join-name-input">
                  Ton pseudo
                </label>
                <input
                  id="join-name-input"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex : Sarah"
                  autoFocus
                />

                <label className="label">Couleur de ton curseur</label>
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

                <button
                  className="btn primary block"
                  disabled={!name.trim()}
                  onClick={() => onJoin(name.trim(), color)}
                >
                  Rejoindre en tant qu'invité
                </button>
              </div>
            </div>

            <div className="or-divider">
              <span>OU</span>
            </div>

            {/* Option 2: Connect with Spotify */}
            <div className="join-option-card spotify-option">
              <div className="option-title">
                <span className="badge spotify">Option 2</span>
                <strong>Se connecter avec un compte Spotify</strong>
              </div>
              <p className="hint">
                Pour écouter les extraits directement dans ton navigateur si ton compte est autorisé sur l'app.
              </p>
              <button className="btn block" onClick={onLoginWithSpotify}>
                Se connecter avec Spotify
              </button>
            </div>

            <button className="btn ghost block" onClick={onDecline} style={{ marginTop: '10px' }}>
              Ignorer l'invitation
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
