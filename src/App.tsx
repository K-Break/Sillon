import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  beginDuels,
  answerDuel,
  createEngine,
  currentDuel,
  finalOrder,
  finishNow,
  placeInTier,
  skipTrack,
  tierProgress,
  type Choice,
  type EngineState,
} from './engine'
import type { Track } from './types'
import { ApiError, getMe, savePlaylist } from './spotify/api'
import { getToken, handleCallback, isConfigured, login, logout } from './spotify/auth'
import { DemoPlayer, SpotifyPlayer, preloadSdk, type Player } from './spotify/player'
import {
  clearSession,
  loadSession,
  loadSettings,
  saveSession,
  saveSettings,
  type Session,
  type Settings,
} from './storage'
import { usePlaybackState } from './hooks'
import { Welcome } from './components/Welcome'
import { Import } from './components/Import'
import { TierStage } from './components/TierStage'
import { Between } from './components/Between'
import { DuelStage } from './components/DuelStage'
import { Result } from './components/Result'
import { CloseIcon, GearIcon } from './components/icons'
import { useMultiplayer } from './multiplayer/useMultiplayer'
import { MultiplayerCursors } from './components/MultiplayerCursors'
import { RoomModal } from './components/RoomModal'
import { JoinBanner } from './components/JoinBanner'
import { Lobby } from './components/Lobby'
import { getLocalPlayerProfile } from './multiplayer/identity'
import type { EngineActionPayload, RoomSyncPayload } from './multiplayer/types'

type Screen = 'welcome' | 'import' | 'sort' | 'result'
const STEPS: { key: Screen; label: string }[] = [
  { key: 'import', label: 'Sélection' },
  { key: 'sort', label: 'Tri' },
  { key: 'result', label: 'Résultat' },
]

function describe(e: unknown): string {
  if (e instanceof ApiError && e.status === 403) {
    return "Ce compte n'est pas autorisé sur l'app Spotify. Le propriétaire doit l'ajouter dans « User Management » du dashboard développeur (5 comptes maximum)."
  }
  return e instanceof Error ? e.message : 'Une erreur est survenue.'
}

export default function App() {
  const [auth, setAuth] = useState<'loading' | 'out' | 'in'>('loading')
  const [me, setMe] = useState<{ id: string; name: string } | null>(null)
  const [demo, setDemo] = useState(false)
  const [screen, setScreen] = useState<Screen>('welcome')
  const [session, setSession] = useState<Session | null>(null)
  const [history, setHistory] = useState<EngineState[]>([])
  const [saved, setSaved] = useState<Session | null>(() => loadSession())
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [roomModalOpen, setRoomModalOpen] = useState(false)
  const [player, setPlayer] = useState<Player | null>(null)
  const playback = usePlaybackState(player)
  const [muted, setMuted] = useState(false)

  // Pending room invitation in URL query param ?room=XYZ or persisted across Spotify OAuth redirects
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const urlCode = new URLSearchParams(window.location.search).get('room')
    const savedCode = sessionStorage.getItem('sillon:pending_room')
    const code = urlCode || savedCode
    return code ? code.toUpperCase() : null
  })

  useEffect(() => {
    if (!playback.error) setMuted(false)
  }, [playback.error])

  const sessionRef = useRef(session)
  sessionRef.current = session
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const playerRef = useRef(player)
  playerRef.current = player

  const makePlayer = useCallback((isDemo: boolean) => {
    const current = playerRef.current
    if (current) {
      const isCurrentDemo = current instanceof DemoPlayer
      if (isCurrentDemo === isDemo) {
        return
      }
      current.dispose()
    }
    setPlayer(isDemo ? new DemoPlayer() : new SpotifyPlayer())
  }, [])

  /* ---------- Multijoueur ---------- */
  const onRemoteSync = useCallback(
    (sync: RoomSyncPayload) => {
      const remoteSession: Session = {
        sourceName: sync.sourceName,
        tracks: sync.tracks,
        engine: sync.engine,
        demo: sync.demo,
        updatedAt: sync.timestamp,
      }
      setSession(remoteSession)
      setHistory([])
      setScreen(sync.engine.phase === 'done' ? 'result' : 'sort')
      if (auth === 'in' && !sync.demo) {
        makePlayer(false)
      } else {
        makePlayer(true)
      }
    },
    [auth, makePlayer],
  )

  const onRemoteEngineAction = useCallback((payload: EngineActionPayload) => {
    const s = sessionRef.current
    if (!s) return
    setHistory((h) => [...h.slice(-299), s.engine])
    setSession({ ...s, engine: payload.engine, updatedAt: Date.now() })
  }, [])

  const onError = useCallback((m: string) => setError(m), [])

  const multiplayer = useMultiplayer({
    spotifyUser: me,
    currentSession: session,
    onRemoteSync,
    onRemoteEngineAction,
    onError,
  })

  /* ---------- Connexion ---------- */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (location.pathname === '/callback') await handleCallback()
        if (await getToken()) {
          const profile = await getMe()
          if (!alive) return
          setMe(profile)
          setAuth('in')
          setScreen((s) => (s === 'welcome' ? 'import' : s))
          preloadSdk().catch(() => {})
        } else if (alive) setAuth('out')
      } catch (e) {
        if (!alive) return
        setError(describe(e))
        setAuth('out')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /* ---------- Persistance ---------- */
  useEffect(() => {
    if (session) saveSession(session)
  }, [session])
  useEffect(() => saveSettings(settings), [settings])

  /* ---------- Lecture ---------- */
  const playTrack = useCallback((t: Track) => {
    playerRef.current?.play(t, settingsRef.current.start)
  }, [])
  const pressCover = useCallback(
    (t: Track) => {
      const p = playerRef.current
      if (!p) return
      if (p.getState().trackId === t.id) p.toggle()
      else playTrack(t)
    },
    [playTrack],
  )
  const toggle = useCallback(() => playerRef.current?.toggle(), [])

  /* ---------- Moteur ---------- */
  const commit = (next: EngineState) => {
    const s = sessionRef.current
    if (!s) return
    setHistory((h) => [...h.slice(-299), s.engine])
    setSession({ ...s, engine: next, updatedAt: Date.now() })
    if (multiplayer.roomId) {
      multiplayer.triggerEngineUpdate(next)
    }
  }

  const undo = () => {
    const s = sessionRef.current
    if (!s || history.length === 0) return
    const prevEngine = history[history.length - 1]
    setSession({ ...s, engine: prevEngine, updatedAt: Date.now() })
    setHistory(history.slice(0, -1))
    if (multiplayer.roomId) {
      multiplayer.triggerEngineUpdate(prevEngine, 'Annuler')
    }
  }

  useEffect(() => {
    if (screen === 'sort' && session?.engine.phase === 'done') {
      playerRef.current?.pause()
      setScreen('result')
    }
  }, [screen, session])

  /* ---------- Navigation ---------- */
  const startSession = (tracks: Track[], sourceName: string) => {
    makePlayer(demo)
    const newSession: Session = {
      sourceName,
      tracks,
      engine: createEngine(tracks.map((t) => t.id)),
      demo,
      updatedAt: Date.now(),
    }
    setSession(newSession)
    setHistory([])
    setScreen('sort')
    if (multiplayer.roomId) {
      multiplayer.triggerSessionSync(newSession)
    }
  }

  const resume = () => {
    if (!saved) return
    if (saved.demo) setDemo(true)
    else if (auth !== 'in') {
      setError("Connecte-toi à Spotify pour reprendre ce tri (ou ouvre-le en mode démo si c'était une démo).")
      return
    }
    makePlayer(saved.demo)
    setSession(saved)
    setHistory([])
    setScreen(saved.engine.phase === 'done' ? 'result' : 'sort')
  }

  const restart = () => {
    playerRef.current?.dispose()
    setPlayer(null)
    clearSession()
    setSaved(null)
    setSession(null)
    setHistory([])
    setScreen(demo || auth === 'in' ? 'import' : 'welcome')
  }

  const disconnect = () => {
    logout()
    playerRef.current?.dispose()
    setPlayer(null)
    setMe(null)
    setAuth('out')
    setDemo(false)
    setScreen('welcome')
  }

  const tracksById = useMemo(() => new Map((session?.tracks ?? []).map((t) => [t.id, t])), [session?.tracks])

  const saveToSpotify = async (name: string) => {
    if (!session) throw new Error('Aucune session.')
    const uris = finalOrder(session.engine)
      .map((r) => tracksById.get(r.id)?.uri)
      .filter((u): u is string => Boolean(u))
    return (await savePlaylist(name, uris)).url
  }

  const isWaitingInLobby = Boolean(multiplayer.roomId && !multiplayer.isHost && !session)
  const stepIndex = isWaitingInLobby ? -1 : screen === 'import' ? 0 : screen === 'sort' ? 1 : screen === 'result' ? 2 : -1
  const engine = session?.engine
  const canUndo = history.length > 0
  const showPlaybackError = screen === 'sort' && playback.error && !muted

  return (
    <div className="app">
      {/* Cursors and live reactions overlay */}
      {multiplayer.roomId && (
        <MultiplayerCursors cursors={multiplayer.remoteCursors} reactions={multiplayer.reactions} />
      )}

      {/* Invitation popup when arriving via ?room=XYZ link */}
      {pendingInviteCode && !multiplayer.roomId && (
        <JoinBanner
          roomCode={pendingInviteCode}
          spotifyUser={me}
          defaultName={me?.name || getLocalPlayerProfile().name}
          onJoin={(name, color) => {
            sessionStorage.removeItem('sillon:pending_room')
            multiplayer.joinRoom(pendingInviteCode, false, name, color)
            setPendingInviteCode(null)
          }}
          onLoginWithSpotify={() => {
            sessionStorage.setItem('sillon:pending_room', pendingInviteCode)
            login().catch((e) => setError(describe(e)))
          }}
          onDecline={() => {
            sessionStorage.removeItem('sillon:pending_room')
            setPendingInviteCode(null)
            const url = new URL(window.location.href)
            url.searchParams.delete('room')
            window.history.replaceState({}, '', url.toString())
          }}
        />
      )}

      {/* Multiplayer Room Drawer / Modal */}
      <RoomModal
        isOpen={roomModalOpen}
        roomId={multiplayer.roomId}
        myId={multiplayer.myId}
        participants={multiplayer.participants}
        isHost={multiplayer.isHost}
        defaultName={me?.name || getLocalPlayerProfile().name}
        onClose={() => setRoomModalOpen(false)}
        onCreate={(code) => {
          multiplayer.createRoom(code)
          if (!session) {
            setScreen('import')
          }
        }}
        onJoin={(code, asHost, name, color) => {
          multiplayer.joinRoom(code, asHost, name, color)
        }}
        onLeave={() => {
          multiplayer.leaveRoom()
          setRoomModalOpen(false)
        }}
        onReaction={(emoji) => {
          multiplayer.sendEmojiReaction(emoji)
        }}
      />

      <header className="topbar">
        <div className="topbar-inner">
          <button className="wordmark" onClick={() => screen === 'welcome' || setScreen(session ? screen : 'welcome')}>
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2" opacity=".4" />
              <circle cx="16" cy="16" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" opacity=".7" />
              <circle cx="16" cy="16" r="2.6" fill="var(--accent)" />
            </svg>
            Sillon
          </button>

          {stepIndex >= 0 && (
            <ol className="steps" aria-label="Progression">
              {STEPS.map((s, i) => (
                <li key={s.key} className={i === stepIndex ? 'current' : i < stepIndex ? 'past' : ''}>
                  {s.label}
                </li>
              ))}
            </ol>
          )}

          <div className="topbar-end">
            {/* Multiplayer Room indicator button */}
            <button
              className={`room-pill${multiplayer.roomId ? ' connected' : ''}`}
              onClick={() => setRoomModalOpen(true)}
              title={
                multiplayer.roomId
                  ? `Salle ${multiplayer.roomId} · ${multiplayer.participants.length} joueur(s)`
                  : 'Multijoueur'
              }
            >
              <span className={`live-dot${multiplayer.roomId ? ' active' : ''}`} />
              {multiplayer.roomId ? (
                <>
                  <span className="room-code">{multiplayer.roomId}</span>
                  <span className="room-count">({multiplayer.participants.length})</span>
                  <span className="avatar-stack">
                    {multiplayer.participants.slice(0, 3).map((p) => (
                      <i key={p.id} style={{ backgroundColor: p.color }}>
                        {p.name.slice(0, 1)}
                      </i>
                    ))}
                  </span>
                </>
              ) : (
                <span>Multijoueur</span>
              )}
            </button>

            {screen === 'sort' && (
              <div className="menu">
                <button
                  className="icon-btn"
                  aria-label="Réglages de lecture"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen((o) => !o)}
                >
                  <GearIcon />
                </button>
                {settingsOpen && (
                  <div className="popover" role="dialog" aria-label="Réglages de lecture">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={settings.autoplay}
                        onChange={(e) => setSettings({ ...settings, autoplay: e.target.checked })}
                      />
                      <span>Lancer les extraits automatiquement</span>
                    </label>
                    <div className="segmented" role="radiogroup" aria-label="Début de l'extrait">
                      <button
                        role="radio"
                        aria-checked={settings.start === 0}
                        onClick={() => setSettings({ ...settings, start: 0 })}
                      >
                        Début du son
                      </button>
                      <button
                        role="radio"
                        aria-checked={settings.start > 0}
                        onClick={() => setSettings({ ...settings, start: 0.3 })}
                      >
                        Vers le refrain
                      </button>
                    </div>
                    <p className="hint">« Vers le refrain » démarre à 30 % du morceau, une estimation.</p>
                  </div>
                )}
              </div>
            )}
            {auth === 'in' && me && (
              <>
                <span className="account">{me.name}</span>
                <button className="link" onClick={disconnect}>
                  Se déconnecter
                </button>
              </>
            )}
            {demo && auth !== 'in' && <span className="account">Mode démo</span>}
          </div>
        </div>
      </header>

      {(error || showPlaybackError) && (
        <div className="banner" role="alert">
          <span>{error ?? playback.error}</span>
          <button className="icon-btn" aria-label="Fermer" onClick={() => (error ? setError(null) : setMuted(true))}>
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      <main className="main">
        {isWaitingInLobby && (
          <Lobby
            roomCode={multiplayer.roomId!}
            hostName={multiplayer.participants.find((p) => p.isHost)?.name || 'Le chef du groupe'}
            participants={multiplayer.participants}
            myId={multiplayer.myId}
            onLeave={() => multiplayer.leaveRoom()}
            onReaction={(emoji) => multiplayer.sendEmojiReaction(emoji)}
          />
        )}

        {!isWaitingInLobby && screen === 'welcome' && (
          <Welcome
            configured={isConfigured()}
            saved={saved}
            onLogin={() => login().catch((e) => setError(describe(e)))}
            onDemo={() => {
              setDemo(true)
              setScreen('import')
            }}
            onResume={resume}
            onOpenMultiplayer={() => setRoomModalOpen(true)}
          />
        )}

        {!isWaitingInLobby && screen === 'import' && (
          <Import
            demo={demo}
            meId={me?.id ?? null}
            onStart={startSession}
            onError={onError}
            multiplayerInfo={
              multiplayer.roomId
                ? {
                    roomId: multiplayer.roomId,
                    isHost: multiplayer.isHost,
                    participantsCount: multiplayer.participants.length,
                  }
                : undefined
            }
          />
        )}

        {screen === 'sort' && engine && (
          <>
            {engine.phase === 'tier' && (
              <div className="progress slim" aria-hidden="true">
                <i style={{ transform: `scaleX(${tierProgress(engine)})` }} />
              </div>
            )}
            {engine.phase === 'tier' && (
              <TierStage
                engine={engine}
                tracks={tracksById}
                playback={playback}
                autoplay={settings.autoplay}
                canUndo={canUndo}
                multiplayer={
                  multiplayer.roomId
                    ? {
                        active: true,
                        myId: multiplayer.myId,
                        isHost: multiplayer.isHost,
                        participants: multiplayer.participants,
                        votes: multiplayer.tierVotes,
                        onVote: (tier: number | 'skip') => multiplayer.sendTierVote(engine.queue[0] ?? '', tier),
                      }
                    : undefined
                }
                onPress={pressCover}
                onToggle={toggle}
                onAuto={playTrack}
                onPlace={(t) => commit(placeInTier(engine, t))}
                onSkip={() => commit(skipTrack(engine))}
                onUndo={undo}
              />
            )}
            {engine.phase === 'between' && (
              <Between
                engine={engine}
                canUndo={canUndo}
                onRefine={() => commit(beginDuels(engine))}
                onSkipRefine={() => commit(finishNow(engine))}
                onUndo={undo}
              />
            )}
            {engine.phase === 'duel' && (
              <DuelStage
                engine={engine}
                tracks={tracksById}
                playback={playback}
                autoplay={settings.autoplay}
                canUndo={canUndo}
                multiplayer={
                  multiplayer.roomId
                    ? {
                        active: true,
                        myId: multiplayer.myId,
                        isHost: multiplayer.isHost,
                        participants: multiplayer.participants,
                        votes: multiplayer.duelVotes,
                        onVote: (choice: 'left' | 'right' | 'tie') => {
                          const d = currentDuel(engine)
                          if (d) {
                            multiplayer.sendDuelVote(`${d.cur}:${d.opp}`, choice)
                          }
                        },
                      }
                    : undefined
                }
                onPress={pressCover}
                onToggle={toggle}
                onAuto={playTrack}
                onAnswer={(c: Choice) => commit(answerDuel(engine, c))}
                onUndo={undo}
                onFinish={() => commit(finishNow(engine))}
              />
            )}
          </>
        )}

        {screen === 'result' && session && (
          <Result
            engine={session.engine}
            tracks={tracksById}
            sourceName={session.sourceName}
            demo={session.demo}
            onSave={saveToSpotify}
            onRestart={restart}
          />
        )}
      </main>
    </div>
  )
}
