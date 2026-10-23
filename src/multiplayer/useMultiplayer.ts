import { useCallback, useEffect, useRef, useState } from 'react'
import type { EngineState } from '../engine'
import type { Track } from '../types'
import {
  broadcastCursor,
  broadcastEngineAction,
  broadcastReaction,
  broadcastSessionSync,
  castDuelVote,
  castTierVote,
  getLocalSelfId,
  initRoom,
  leaveRoom as destroyRoom,
} from './room'
import type {
  DuelVotes,
  EngineActionPayload,
  Participant,
  ReactionPayload,
  RemoteCursor,
  RoomSyncPayload,
  TierVotes,
} from './types'
import { generateRoomCode, getLocalPlayerProfile, saveLocalPlayerProfile } from './identity'

interface Props {
  spotifyUser: { id: string; name: string } | null
  currentSession: { sourceName: string; tracks: Track[]; engine: EngineState; demo: boolean } | null
  onRemoteSync: (sync: RoomSyncPayload) => void
  onRemoteEngineAction: (payload: EngineActionPayload) => void
  onError: (msg: string) => void
}

export function useMultiplayer({
  spotifyUser,
  currentSession,
  onRemoteSync,
  onRemoteEngineAction,
  onError,
}: Props) {
  const [roomId, setRoomId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('room')?.toUpperCase() || null
  })
  const [participants, setParticipants] = useState<Participant[]>([])
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map())
  const [duelVotes, setDuelVotes] = useState<DuelVotes>({ duelKey: '', votes: {} })
  const [tierVotes, setTierVotes] = useState<TierVotes>({ trackId: '', votes: {} })
  const [reactions, setReactions] = useState<ReactionPayload[]>([])

  const currentSessionRef = useRef(currentSession)
  currentSessionRef.current = currentSession
  const onRemoteSyncRef = useRef(onRemoteSync)
  onRemoteSyncRef.current = onRemoteSync
  const onRemoteEngineActionRef = useRef(onRemoteEngineAction)
  onRemoteEngineActionRef.current = onRemoteEngineAction
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const myId = getLocalSelfId()
  const myParticipant = participants.find((p) => p.id === myId)
  const isHost = Boolean(myParticipant?.isHost)

  // Join or leave room effect
  const join = useCallback(
    (code: string, asHost = false, customName?: string, customColor?: string) => {
      const cleanCode = code.trim().toUpperCase()
      if (!cleanCode) return

      const profile = getLocalPlayerProfile(spotifyUser?.name)
      const name = customName?.trim() || profile.name
      const color = customColor || profile.color
      saveLocalPlayerProfile(name, color)

      setRoomId(cleanCode)

      // Update URL query param without full page reload
      const url = new URL(window.location.href)
      url.searchParams.set('room', cleanCode)
      window.history.replaceState({}, '', url.toString())

      initRoom(
        cleanCode,
        {
          name,
          color,
          avatar: name.slice(0, 2).toUpperCase(),
          isHost: asHost,
          hasSpotify: Boolean(spotifyUser),
        },
        {
          onPresence: (list) => {
            setParticipants(list)
          },
          onCursor: (cursor) => {
            setRemoteCursors((prev) => {
              const next = new Map(prev)
              next.set(cursor.id, cursor)
              return next
            })
          },
          onSync: (sync) => {
            onRemoteSyncRef.current(sync)
          },
          onEngineAction: (action) => {
            onRemoteEngineActionRef.current(action)
          },
          onDuelVotes: (votes) => {
            setDuelVotes(votes)
          },
          onTierVotes: (votes) => {
            setTierVotes(votes)
          },
          onReaction: (rx) => {
            setReactions((prev) => [...prev.slice(-9), rx])
          },
          onError: (err) => {
            onErrorRef.current(err.message)
          },
        },
        () => currentSessionRef.current,
      )
    },
    [spotifyUser],
  )

  const create = useCallback(
    (customCode?: string) => {
      const code = customCode?.trim().toUpperCase() || generateRoomCode()
      join(code, true)
      return code
    },
    [join],
  )

  const leave = useCallback(() => {
    destroyRoom()
    setRoomId(null)
    setParticipants([])
    setRemoteCursors(new Map())
    setDuelVotes({ duelKey: '', votes: {} })
    setTierVotes({ trackId: '', votes: {} })

    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState({}, '', url.toString())
  }, [])

  // Auto-clean stale cursors
  useEffect(() => {
    if (!roomId) return
    const timer = setInterval(() => {
      const now = Date.now()
      setRemoteCursors((prev) => {
        let changed = false
        const next = new Map(prev)
        next.forEach((cursor, id) => {
          if (now - cursor.lastSeen > 5000) {
            next.delete(id)
            changed = true
          }
        })
        return changed ? next : prev
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [roomId])

  // Mouse move and click broadcasting
  useEffect(() => {
    if (!roomId) return

    let lastSent = 0
    let scheduled: number | null = null
    let latestX = 0
    let latestY = 0

    const sendNow = (clicking = false) => {
      broadcastCursor(latestX, latestY, clicking)
      lastSent = performance.now()
    }

    const handlePointerMove = (e: PointerEvent) => {
      latestX = Math.min(1, Math.max(0, e.clientX / window.innerWidth))
      latestY = Math.min(1, Math.max(0, e.clientY / window.innerHeight))

      const now = performance.now()
      if (now - lastSent >= 35) {
        if (scheduled !== null) {
          cancelAnimationFrame(scheduled)
          scheduled = null
        }
        sendNow(false)
      } else if (scheduled === null) {
        scheduled = requestAnimationFrame(() => {
          scheduled = null
          sendNow(false)
        })
      }
    }

    const handlePointerDown = (e: PointerEvent) => {
      latestX = Math.min(1, Math.max(0, e.clientX / window.innerWidth))
      latestY = Math.min(1, Math.max(0, e.clientY / window.innerHeight))
      sendNow(true)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })

    return () => {
      if (scheduled !== null) cancelAnimationFrame(scheduled)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [roomId])

  const sendDuelVote = useCallback((duelKey: string, choice: 'left' | 'right' | 'tie') => {
    const updated = castDuelVote(duelKey, choice)
    if (updated) setDuelVotes(updated)
  }, [])

  const sendTierVote = useCallback((trackId: string, tier: number | 'skip') => {
    const updated = castTierVote(trackId, tier)
    if (updated) setTierVotes(updated)
  }, [])

  const triggerEngineUpdate = useCallback(
    (nextEngine: EngineState, description?: string) => {
      broadcastEngineAction(nextEngine, description)
      setDuelVotes({ duelKey: '', votes: {} })
      setTierVotes({ trackId: '', votes: {} })
    },
    [],
  )

  const triggerSessionSync = useCallback(
    (session: { sourceName: string; tracks: Track[]; engine: EngineState; demo: boolean }) => {
      broadcastSessionSync(session)
    },
    [],
  )

  const sendEmojiReaction = useCallback((emoji: string, x = 0.5, y = 0.5) => {
    broadcastReaction(emoji, x, y)
    const profile = getLocalPlayerProfile()
    setReactions((prev) => [
      ...prev.slice(-9),
      {
        id: Math.random().toString(36).slice(2, 9),
        emoji,
        x,
        y,
        senderName: profile.name,
      },
    ])
  }, [])

  return {
    roomId,
    myId,
    participants,
    isHost,
    remoteCursors: Array.from(remoteCursors.values()),
    duelVotes,
    tierVotes,
    reactions,
    createRoom: create,
    joinRoom: join,
    leaveRoom: leave,
    sendDuelVote,
    sendTierVote,
    triggerEngineUpdate,
    triggerSessionSync,
    sendEmojiReaction,
  }
}
