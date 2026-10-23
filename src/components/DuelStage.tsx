import { useEffect, useRef, useState } from 'react'
import { TIERS, currentDuel, duelProgress, remainingDuels, type Choice, type EngineState } from '../engine'
import type { Track } from '../types'
import type { PlaybackState } from '../spotify/player'
import { useHotkeys } from '../hooks'
import { PlayCover } from './Cover'
import { UndoIcon } from './icons'
import type { DuelVotes, Participant } from '../multiplayer/types'

export interface DuelMultiplayerProps {
  active: boolean
  myId: string
  isHost: boolean
  participants: Participant[]
  votes: DuelVotes
  onVote: (choice: 'left' | 'right' | 'tie') => void
}

interface Props {
  engine: EngineState
  tracks: Map<string, Track>
  playback: PlaybackState
  autoplay: boolean
  canUndo: boolean
  multiplayer?: DuelMultiplayerProps
  onPress: (t: Track) => void
  onToggle: () => void
  onAuto: (t: Track) => void
  onAnswer: (c: Choice) => void
  onUndo: () => void
  onFinish: () => void
}

type Side = 'left' | 'right' | 'tie'
const ANSWER_MS = 380

export function DuelStage({
  engine,
  tracks,
  playback,
  autoplay,
  canUndo,
  multiplayer,
  onPress,
  onToggle,
  onAuto,
  onAnswer,
  onUndo,
  onFinish,
}: Props) {
  const duel = currentDuel(engine)
  const [picked, setPicked] = useState<Side | null>(null)
  const lastCur = useRef<string | null>(null)
  const autoRef = useRef(onAuto)
  autoRef.current = onAuto

  const curId = duel?.cur
  const oppId = duel?.opp
  const flip = duel?.flip ?? false
  const leftId = flip ? oppId : curId
  const rightId = flip ? curId : oppId
  const duelKey = curId && oppId ? `${curId}:${oppId}` : ''

  // Nouveau son à classer : on lance celui de gauche. Sinon on lance le nouvel adversaire.
  useEffect(() => {
    if (!autoplay || !curId || !oppId) return
    const first = lastCur.current !== curId
    lastCur.current = curId
    const target = first ? leftId : oppId
    const t = target ? tracks.get(target) : undefined
    if (t) autoRef.current(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId, oppId, autoplay])

  // Single-player choice
  const chooseSingle = (side: Side) => {
    if (picked || !duel) return
    setPicked(side)
    const choice: Choice = side === 'tie' ? 'tie' : side === 'left' ? (flip ? 'opp' : 'cur') : flip ? 'cur' : 'opp'
    window.setTimeout(() => {
      onAnswer(choice)
      setPicked(null)
    }, ANSWER_MS)
  }

  // Multiplayer vote calculation
  const mpActive = Boolean(multiplayer?.active)
  const currentVotes = (mpActive && multiplayer?.votes.duelKey === duelKey ? multiplayer.votes.votes : {}) || {}
  const participants = multiplayer?.participants ?? []
  const totalPlayers = Math.max(1, participants.length)
  const majorityThreshold = Math.floor(totalPlayers / 2) + 1

  const votersBySide: Record<Side, Participant[]> = {
    left: [],
    right: [],
    tie: [],
  }

  Object.entries(currentVotes).forEach(([peerId, side]) => {
    const p = participants.find((part) => part.id === peerId)
    if (p && votersBySide[side]) {
      votersBySide[side].push(p)
    }
  })

  const leftCount = votersBySide.left.length
  const rightCount = votersBySide.right.length
  const tieCount = votersBySide.tie.length
  const totalVotesCast = leftCount + rightCount + tieCount

  // Check if majority is met
  const hostRef = useRef(onAnswer)
  hostRef.current = onAnswer
  const isResolving = useRef(false)

  useEffect(() => {
    if (!mpActive || !duel || isResolving.current) return

    let winningSide: Side | null = null

    if (leftCount >= majorityThreshold) winningSide = 'left'
    else if (rightCount >= majorityThreshold) winningSide = 'right'
    else if (tieCount >= majorityThreshold) winningSide = 'tie'
    else if (totalVotesCast >= totalPlayers && totalPlayers > 1) {
      if (leftCount > rightCount && leftCount > tieCount) winningSide = 'left'
      else if (rightCount > leftCount && rightCount > tieCount) winningSide = 'right'
      else winningSide = 'tie'
    }

    if (winningSide) {
      isResolving.current = true
      setPicked(winningSide)
      const choice: Choice =
        winningSide === 'tie' ? 'tie' : winningSide === 'left' ? (flip ? 'opp' : 'cur') : flip ? 'cur' : 'opp'

      const timer = window.setTimeout(() => {
        if (multiplayer?.isHost) {
          hostRef.current(choice)
        }
        setPicked(null)
        isResolving.current = false
      }, ANSWER_MS)

      return () => clearTimeout(timer)
    }
  }, [mpActive, duel, flip, leftCount, rightCount, tieCount, totalVotesCast, totalPlayers, majorityThreshold, multiplayer?.isHost])

  const handlePick = (side: Side) => {
    if (mpActive && multiplayer) {
      multiplayer.onVote(side)
    } else {
      chooseSingle(side)
    }
  }

  const listen = (side: 'left' | 'right') => {
    const t = tracks.get((side === 'left' ? leftId : rightId) ?? '')
    if (t) onPress(t)
  }

  useHotkeys((e) => {
    if (e.key === 'ArrowLeft') handlePick('left')
    else if (e.key === 'ArrowRight') handlePick('right')
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      handlePick('tie')
    } else if (e.key === '1') listen('left')
    else if (e.key === '2') listen('right')
    else if (e.key === ' ') {
      e.preventDefault()
      onToggle()
    } else if (e.key.toLowerCase() === 'z' && canUndo && !picked) onUndo()
  })

  const left = leftId ? tracks.get(leftId) : undefined
  const right = rightId ? tracks.get(rightId) : undefined
  if (!duel || !left || !right) return null

  const remaining = remainingDuels(engine)
  const state = (side: 'left' | 'right') => {
    if (picked !== null) {
      return picked === 'tie' ? ' tie' : picked === side ? ' won' : ' lost'
    }
    if (mpActive && multiplayer) {
      const myVote = currentVotes[multiplayer.myId]
      if (myVote === side) return ' my-voted'
    }
    return ''
  }

  return (
    <section className="duel-stage">
      <div className="duel-head">
        <div className="duel-title-group">
          <p>
            Affinage · <strong>{TIERS[engine.tierIdx]}</strong>
          </p>
          {mpActive && (
            <div className="mp-vote-indicator">
              <span className="live-dot" />
              <span>
                Votes : {totalVotesCast}/{totalPlayers} (Majorité : {majorityThreshold})
              </span>
            </div>
          )}
        </div>
        <p className="muted">
          environ {Math.max(remaining, 1)} duel{remaining > 1 ? 's' : ''} restant{remaining > 1 ? 's' : ''}
        </p>
      </div>
      <div className="progress" aria-hidden="true">
        <i style={{ transform: `scaleX(${duelProgress(engine)})` }} />
      </div>

      <div className="duel-cards">
        <DuelCard
          key={left.id}
          track={left}
          playback={playback}
          className={state('left')}
          hint="←"
          voters={mpActive ? votersBySide.left : undefined}
          isMyVote={mpActive && currentVotes[multiplayer?.myId ?? ''] === 'left'}
          onPress={() => onPress(left)}
          onPick={() => handlePick('left')}
        />
        <DuelCard
          key={right.id}
          track={right}
          playback={playback}
          className={state('right')}
          hint="→"
          voters={mpActive ? votersBySide.right : undefined}
          isMyVote={mpActive && currentVotes[multiplayer?.myId ?? ''] === 'right'}
          onPress={() => onPress(right)}
          onPick={() => handlePick('right')}
        />
      </div>

      <div className="duel-actions">
        <button className="btn ghost" onClick={onUndo} disabled={!canUndo || picked !== null}>
          <UndoIcon size={16} /> Annuler
        </button>
        <div className="tie-container">
          <button
            className={`btn${mpActive && currentVotes[multiplayer?.myId ?? ''] === 'tie' ? ' active' : ''}`}
            onClick={() => handlePick('tie')}
          >
            Égalité {tieCount > 0 && `(${tieCount})`}
          </button>
          {mpActive && votersBySide.tie.length > 0 && (
            <div className="voters-chips mini">
              {votersBySide.tie.map((p) => (
                <span
                  key={p.id}
                  className="voter-chip mini"
                  style={{ backgroundColor: p.color }}
                  title={`${p.name} a voté égalité`}
                >
                  {p.name.slice(0, 1)}
                </span>
              ))}
            </div>
          )}
        </div>
        <button className="btn ghost" onClick={onFinish}>
          Terminer maintenant
        </button>
      </div>

      <p className="keys">
        {mpActive
          ? 'Vote majoritaire activé · ← → voter · ↓ égalité · 1 et 2 pour écouter sur ton Spotify'
          : '← → choisir · ↓ égalité · 1 et 2 pour écouter · espace pour pause · Z pour annuler'}
      </p>
    </section>
  )
}

function DuelCard({
  track,
  playback,
  className,
  hint,
  voters,
  isMyVote,
  onPress,
  onPick,
}: {
  track: Track
  playback: PlaybackState
  className: string
  hint: string
  voters?: Participant[]
  isMyVote?: boolean
  onPress: () => void
  onPick: () => void
}) {
  return (
    <article className={`duel-card${className}`}>
      <PlayCover track={track} state={playback} onPress={onPress} />
      <div className="meta">
        <h3 className="track-title">{track.name}</h3>
        <p className="track-artist">{track.artists}</p>
      </div>

      {voters && voters.length > 0 && (
        <div className="duel-voters-bar">
          <div className="voters-chips">
            {voters.map((p) => (
              <span
                key={p.id}
                className="voter-chip"
                style={{ backgroundColor: p.color }}
                title={`${p.name} a voté pour ce son`}
              >
                <span className="chip-avatar">{p.name.slice(0, 1)}</span>
                <span className="chip-name">{p.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <button className={`pick${isMyVote ? ' picked' : ''}`} onClick={onPick}>
        {isMyVote ? 'Ton vote ✓' : 'Celui-ci'} <kbd>{hint}</kbd>
      </button>
    </article>
  )
}
