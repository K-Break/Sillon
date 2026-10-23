import type { EngineState } from '../engine'
import type { Track } from '../types'

export interface Participant {
  id: string
  name: string
  color: string
  avatar: string
  isHost: boolean
  hasSpotify: boolean
}

export interface RemoteCursor {
  id: string
  name: string
  color: string
  x: number // 0..1 percentage of viewport width
  y: number // 0..1 percentage of viewport height
  clicking?: boolean
  lastSeen: number
}

export interface DuelVotes {
  duelKey: string
  votes: Record<string, 'left' | 'right' | 'tie'> // peerId -> choice
}

export interface TierVotes {
  trackId: string
  votes: Record<string, number | 'skip'> // peerId -> tier (0..4) or 'skip'
}

export interface RoomSyncPayload {
  sourceName: string
  tracks: Track[]
  engine: EngineState
  demo: boolean
  hostId: string
  timestamp: number
}

export interface EngineActionPayload {
  engine: EngineState
  actionId: string
  description?: string
}

export interface ReactionPayload {
  id: string
  emoji: string
  x: number
  y: number
  senderName: string
}
