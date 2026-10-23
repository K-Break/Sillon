import { useEffect, useRef, useState } from 'react'
import { TIERS, TIER_COUNT, type EngineState } from '../engine'
import type { Track } from '../types'
import type { PlaybackState } from '../spotify/player'
import { useHotkeys } from '../hooks'
import { PlayCover } from './Cover'
import { UndoIcon } from './icons'
import type { Participant, TierVotes } from '../multiplayer/types'

export interface TierMultiplayerProps {
  active: boolean
  myId: string
  isHost: boolean
  participants: Participant[]
  votes: TierVotes
  onVote: (tier: number | 'skip') => void
}

interface Props {
  engine: EngineState
  tracks: Map<string, Track>
  playback: PlaybackState
  autoplay: boolean
  canUndo: boolean
  multiplayer?: TierMultiplayerProps
  onPress: (t: Track) => void
  onToggle: () => void
  onAuto: (t: Track) => void
  onPlace: (tier: number) => void
  onSkip: () => void
  onUndo: () => void
}

const LEAVE_MS = 260

export function TierStage({
  engine,
  tracks,
  playback,
  autoplay,
  canUndo,
  multiplayer,
  onPress,
  onToggle,
  onAuto,
  onPlace,
  onSkip,
  onUndo,
}: Props) {
  const id = engine.queue[0]
  const track = id ? tracks.get(id) : undefined
  const [leaving, setLeaving] = useState<number | 'skip' | null>(null)
  const [popped, setPopped] = useState<number | null>(null)
  const autoRef = useRef(onAuto)
  autoRef.current = onAuto

  useEffect(() => {
    if (autoplay && track) autoRef.current(track)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, autoplay])

  const mpActive = Boolean(multiplayer?.active)
  const participants = multiplayer?.participants ?? []
  const totalPlayers = Math.max(1, participants.length)
  const majorityThreshold = Math.floor(totalPlayers / 2) + 1
  const currentVotes = (mpActive && multiplayer?.votes.trackId === id ? multiplayer.votes.votes : {}) || {}

  const votersByTier: Record<number | 'skip', Participant[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    skip: [],
  }

  Object.entries(currentVotes).forEach(([peerId, val]) => {
    const p = participants.find((part) => part.id === peerId)
    if (p && votersByTier[val]) {
      votersByTier[val].push(p)
    }
  })

  const totalVotesCast = Object.values(votersByTier).reduce((acc, v) => acc + v.length, 0)

  // Single player place
  const placeSingle = (tier: number) => {
    if (leaving !== null || !track) return
    setLeaving(tier)
    window.setTimeout(() => {
      onPlace(tier)
      setLeaving(null)
      setPopped(tier)
    }, LEAVE_MS)
  }

  // Multiplayer majority trigger
  const hostPlaceRef = useRef(onPlace)
  hostPlaceRef.current = onPlace
  const hostSkipRef = useRef(onSkip)
  hostSkipRef.current = onSkip
  const resolvedTrackIdRef = useRef<string | null>(null)

  useEffect(() => {
    resolvedTrackIdRef.current = null
    setLeaving(null)
  }, [id])

  useEffect(() => {
    if (!mpActive || !track || !id || resolvedTrackIdRef.current === id) return

    let winningTier: number | 'skip' | null = null

    // Check for strict majority
    for (let t = 0; t < TIER_COUNT; t++) {
      if (votersByTier[t].length >= majorityThreshold) {
        winningTier = t
        break
      }
    }
    if (votersByTier.skip.length >= majorityThreshold) {
      winningTier = 'skip'
    }

    // If all players voted and no strict majority, choose highest plurality
    if (winningTier === null && totalVotesCast >= totalPlayers && totalPlayers > 1) {
      let maxCount = -1
      for (let t = 0; t < TIER_COUNT; t++) {
        if (votersByTier[t].length > maxCount) {
          maxCount = votersByTier[t].length
          winningTier = t
        }
      }
      if (votersByTier.skip.length > maxCount) {
        winningTier = 'skip'
      }
    }

    if (winningTier !== null) {
      resolvedTrackIdRef.current = id
      setLeaving(winningTier)

      const chosenTier = winningTier
      const isHost = Boolean(multiplayer?.isHost)

      window.setTimeout(() => {
        if (isHost) {
          if (chosenTier === 'skip') {
            hostSkipRef.current()
          } else {
            hostPlaceRef.current(chosenTier as number)
          }
        }
        if (typeof chosenTier === 'number') {
          setPopped(chosenTier)
        }
      }, LEAVE_MS)

      // Safety watchdog: if host or network lags, restore visibility after 3s so UI is never stuck
      window.setTimeout(() => {
        if (resolvedTrackIdRef.current === id) {
          setLeaving(null)
        }
      }, 3000)
    }
  }, [mpActive, track, id, totalVotesCast, totalPlayers, majorityThreshold, multiplayer?.isHost, currentVotes])

  const handleTierClick = (tier: number) => {
    if (mpActive && multiplayer) {
      multiplayer.onVote(tier)
    } else {
      placeSingle(tier)
    }
  }

  const handleSkipClick = () => {
    if (mpActive && multiplayer) {
      multiplayer.onVote('skip')
    } else {
      onSkip()
    }
  }

  useHotkeys((e) => {
    if (e.key >= '1' && e.key <= String(TIER_COUNT)) handleTierClick(Number(e.key) - 1)
    else if (e.key === ' ') {
      e.preventDefault()
      onToggle()
    } else if (e.key.toLowerCase() === 's') handleSkipClick()
    else if (e.key.toLowerCase() === 'z' && canUndo) onUndo()
  })

  if (!track) return null
  const total = engine.ids.length
  const index = total - engine.queue.length + 1
  const leaveClass =
    leaving === null
      ? ''
      : leaving === 'skip'
        ? ' leave-skip'
        : leaving <= 1
          ? ' leave-up'
          : leaving >= 3
            ? ' leave-down'
            : ' leave-mid'

  return (
    <section className="tier-stage">
      <div className={`tier-card${leaveClass}`} key={id}>
        <PlayCover track={track} state={playback} onPress={() => onPress(track)} />
        <div className="meta">
          <div className="tier-counter-row">
            <p className="counter">
              Son {index} sur {total}
            </p>
            {mpActive && (
              <span className="mp-vote-indicator">
                <span className="live-dot" /> Votes : {totalVotesCast}/{totalPlayers}
              </span>
            )}
          </div>
          <h2 className="track-title">{track.name}</h2>
          <p className="track-artist">{track.artists}</p>
          {track.album && <p className="track-album">{track.album}</p>}
        </div>
      </div>

      <div className="tier-side">
        <p className="side-title">
          {mpActive ? 'Votez pour ranger ce son' : 'Dans quel palier le ranges-tu ?'}
        </p>
        <div className="tier-rows" role="group" aria-label="Paliers">
          {TIERS.map((label, i) => {
            const tierVoters = votersByTier[i] || []
            const isMyChoice = mpActive && currentVotes[multiplayer?.myId ?? ''] === i

            return (
              <button
                key={label}
                className={`tier-row${isMyChoice ? ' my-chosen' : ''}`}
                onClick={() => handleTierClick(i)}
              >
                <kbd>{i + 1}</kbd>
                <span className="tier-label">{label}</span>

                {/* Voters chips */}
                {mpActive && tierVoters.length > 0 && (
                  <div className="tier-voters-chips">
                    {tierVoters.map((p) => (
                      <span
                        key={p.id}
                        className="tier-voter-pill"
                        style={{ backgroundColor: p.color }}
                        title={`${p.name} a voté ${label}`}
                      >
                        {p.name.slice(0, 1)}
                      </span>
                    ))}
                  </div>
                )}

                <span
                  key={`${engine.buckets[i].length}-${popped === i ? 'p' : ''}`}
                  className={`tier-count${popped === i ? ' pop' : ''}`}
                >
                  {engine.buckets[i].length}
                </span>
              </button>
            )
          })}
        </div>
        <div className="side-actions">
          <button className="btn ghost" onClick={onUndo} disabled={!canUndo}>
            <UndoIcon size={16} /> Annuler
          </button>
          <div className="skip-container">
            <button
              className={`btn ghost${mpActive && currentVotes[multiplayer?.myId ?? ''] === 'skip' ? ' active' : ''}`}
              onClick={handleSkipClick}
              disabled={engine.queue.length < 2}
            >
              Passer pour l'instant
            </button>
            {mpActive && votersByTier.skip.length > 0 && (
              <div className="voters-chips mini inline">
                {votersByTier.skip.map((p) => (
                  <span
                    key={p.id}
                    className="voter-chip mini"
                    style={{ backgroundColor: p.color }}
                    title={`${p.name} a voté passer`}
                  >
                    {p.name.slice(0, 1)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="keys">
          {mpActive
            ? 'Vote majoritaire · 1 à 5 pour voter · espace pour écouter sur ton Spotify'
            : '1 à 5 pour ranger · espace pour écouter · S pour passer · Z pour annuler'}
        </p>
      </div>
    </section>
  )
}
