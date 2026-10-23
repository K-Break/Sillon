import { joinRoom, selfId } from 'trystero'
import type { EngineState } from '../engine'
import type { Track } from '../types'
import type {
  Participant,
  RemoteCursor,
  DuelVotes,
  TierVotes,
  RoomSyncPayload,
  EngineActionPayload,
  ReactionPayload,
} from './types'

export interface RoomCallbacks {
  onPresence: (participants: Participant[]) => void
  onCursor: (cursor: RemoteCursor) => void
  onSync: (sync: RoomSyncPayload) => void
  onEngineAction: (payload: EngineActionPayload) => void
  onDuelVotes: (votes: DuelVotes) => void
  onTierVotes: (votes: TierVotes) => void
  onReaction: (reaction: ReactionPayload) => void
  onError?: (err: Error) => void
}

let activeRoom: ReturnType<typeof joinRoom> | null = null
let myParticipant: Participant | null = null
const peers = new Map<string, Participant>()
let duelVotesState: DuelVotes = { duelKey: '', votes: {} }
let tierVotesState: TierVotes = { trackId: '', votes: {} }

let presenceAction: any = null
let cursorAction: any = null
let syncAction: any = null
let engineAction: any = null
let duelVoteAction: any = null
let tierVoteAction: any = null
let reactionAction: any = null
let reqSyncAction: any = null

function updatePresenceList(cb: (p: Participant[]) => void) {
  const list: Participant[] = []
  if (myParticipant) list.push(myParticipant)
  peers.forEach((p) => list.push(p))

  // Determine host: if local participant claims host, or if no host and local is lowest peerId
  const hasHost = list.some((p) => p.isHost)
  if (!hasHost && myParticipant) {
    const allIds = list.map((p) => p.id).sort()
    if (allIds[0] === myParticipant.id) {
      myParticipant.isHost = true
    }
  }

  cb([...list])
}

export function initRoom(
  roomId: string,
  localParticipant: Omit<Participant, 'id'>,
  callbacks: RoomCallbacks,
  currentSessionGetter?: () => { sourceName: string; tracks: Track[]; engine: EngineState; demo: boolean } | null,
) {
  if (activeRoom) {
    leaveRoom()
  }

  const cleanRoomId = roomId.trim().toUpperCase()
  myParticipant = {
    ...localParticipant,
    id: selfId,
  }
  peers.clear()
  duelVotesState = { duelKey: '', votes: {} }
  tierVotesState = { trackId: '', votes: {} }

  try {
    const room = joinRoom({ appId: 'sillon-spotify-tierlist-v1' }, cleanRoomId)
    activeRoom = room

    presenceAction = room.makeAction('presence')
    cursorAction = room.makeAction('cursor')
    syncAction = room.makeAction('sync')
    engineAction = room.makeAction('engine')
    duelVoteAction = room.makeAction('duel_vote')
    tierVoteAction = room.makeAction('tier_vote')
    reactionAction = room.makeAction('reaction')
    reqSyncAction = room.makeAction('req_sync')

    // Incoming Presence
    presenceAction.onMessage = (data: Participant, { peerId }: { peerId: string }) => {
      peers.set(peerId, { ...data, id: peerId })
      updatePresenceList(callbacks.onPresence)

      // If we are host and someone new joined, send them the current session state
      if (myParticipant?.isHost && currentSessionGetter) {
        const session = currentSessionGetter()
        if (session) {
          syncAction?.send(
            {
              sourceName: session.sourceName,
              tracks: session.tracks,
              engine: session.engine,
              demo: session.demo,
              hostId: selfId,
              timestamp: Date.now(),
            },
            { target: peerId },
          )
        }
      }
    }

    // Incoming Cursors
    cursorAction.onMessage = (data: { x: number; y: number; clicking?: boolean }, { peerId }: { peerId: string }) => {
      const p = peers.get(peerId)
      callbacks.onCursor({
        id: peerId,
        name: p?.name || 'Joueur',
        color: p?.color || '#3b82f6',
        x: data.x,
        y: data.y,
        clicking: data.clicking,
        lastSeen: Date.now(),
      })
    }

    // Incoming Session Sync
    syncAction.onMessage = (sync: RoomSyncPayload) => {
      callbacks.onSync(sync)
    }

    // Incoming Engine Action
    engineAction.onMessage = (payload: EngineActionPayload) => {
      // Clear votes when engine advances
      duelVotesState = { duelKey: '', votes: {} }
      tierVotesState = { trackId: '', votes: {} }
      callbacks.onDuelVotes(duelVotesState)
      callbacks.onTierVotes(tierVotesState)
      callbacks.onEngineAction(payload)
    }

    // Incoming Duel Vote
    duelVoteAction.onMessage = (
      vote: { duelKey: string; choice: 'left' | 'right' | 'tie' },
      { peerId }: { peerId: string },
    ) => {
      if (vote.duelKey !== duelVotesState.duelKey) {
        duelVotesState = { duelKey: vote.duelKey, votes: { [peerId]: vote.choice } }
      } else {
        duelVotesState = {
          ...duelVotesState,
          votes: { ...duelVotesState.votes, [peerId]: vote.choice },
        }
      }
      callbacks.onDuelVotes(duelVotesState)
    }

    // Incoming Tier Vote
    tierVoteAction.onMessage = (
      vote: { trackId: string; tier: number | 'skip' },
      { peerId }: { peerId: string },
    ) => {
      if (vote.trackId !== tierVotesState.trackId) {
        tierVotesState = { trackId: vote.trackId, votes: { [peerId]: vote.tier } }
      } else {
        tierVotesState = {
          ...tierVotesState,
          votes: { ...tierVotesState.votes, [peerId]: vote.tier },
        }
      }
      callbacks.onTierVotes(tierVotesState)
    }

    // Incoming Reactions
    reactionAction.onMessage = (rx: ReactionPayload) => {
      callbacks.onReaction(rx)
    }

    // Incoming Sync Requests
    reqSyncAction.onMessage = (_: { from: string }, { peerId }: { peerId: string }) => {
      if (myParticipant?.isHost && currentSessionGetter) {
        const session = currentSessionGetter()
        if (session) {
          syncAction?.send(
            {
              sourceName: session.sourceName,
              tracks: session.tracks,
              engine: session.engine,
              demo: session.demo,
              hostId: selfId,
              timestamp: Date.now(),
            },
            { target: peerId },
          )
        }
      }
    }

    // Peer join
    room.onPeerJoin = (peerId: string) => {
      // Send our presence immediately to the newly joined peer
      if (myParticipant) {
        presenceAction?.send(myParticipant, { target: peerId })
      }
    }

    // Peer leave
    room.onPeerLeave = (peerId: string) => {
      peers.delete(peerId)
      if (duelVotesState.votes[peerId]) {
        const nextVotes = { ...duelVotesState.votes }
        delete nextVotes[peerId]
        duelVotesState = { ...duelVotesState, votes: nextVotes }
        callbacks.onDuelVotes(duelVotesState)
      }
      if (tierVotesState.votes[peerId]) {
        const nextVotes = { ...tierVotesState.votes }
        delete nextVotes[peerId]
        tierVotesState = { ...tierVotesState, votes: nextVotes }
        callbacks.onTierVotes(tierVotesState)
      }
      updatePresenceList(callbacks.onPresence)
    }

    // Trigger initial presence report
    updatePresenceList(callbacks.onPresence)

    // Request sync from any existing peers
    if (!myParticipant.isHost) {
      setTimeout(() => {
        reqSyncAction?.send({ from: selfId })
      }, 500)
    }

    return selfId
  } catch (e) {
    callbacks.onError?.(e instanceof Error ? e : new Error(String(e)))
    return null
  }
}

export function broadcastCursor(x: number, y: number, clicking?: boolean) {
  if (cursorAction) {
    cursorAction.send({ x, y, clicking }).catch(() => {})
  }
}

export function broadcastSessionSync(session: {
  sourceName: string
  tracks: Track[]
  engine: EngineState
  demo: boolean
}) {
  if (syncAction && myParticipant) {
    syncAction
      .send({
        ...session,
        hostId: myParticipant.id,
        timestamp: Date.now(),
      })
      .catch(() => {})
  }
}

export function broadcastEngineAction(engine: EngineState, description?: string) {
  duelVotesState = { duelKey: '', votes: {} }
  tierVotesState = { trackId: '', votes: {} }
  if (engineAction) {
    engineAction
      .send({
        engine,
        actionId: Math.random().toString(36).slice(2, 9),
        description,
      })
      .catch(() => {})
  }
}

export function castDuelVote(duelKey: string, choice: 'left' | 'right' | 'tie') {
  if (!myParticipant) return
  if (duelVotesState.duelKey !== duelKey) {
    duelVotesState = { duelKey, votes: { [myParticipant.id]: choice } }
  } else {
    duelVotesState = {
      ...duelVotesState,
      votes: { ...duelVotesState.votes, [myParticipant.id]: choice },
    }
  }
  if (duelVoteAction) {
    duelVoteAction.send({ duelKey, choice }).catch(() => {})
  }
  return duelVotesState
}

export function castTierVote(trackId: string, tier: number | 'skip') {
  if (!myParticipant) return
  if (tierVotesState.trackId !== trackId) {
    tierVotesState = { trackId, votes: { [myParticipant.id]: tier } }
  } else {
    tierVotesState = {
      ...tierVotesState,
      votes: { ...tierVotesState.votes, [myParticipant.id]: tier },
    }
  }
  if (tierVoteAction) {
    tierVoteAction.send({ trackId, tier }).catch(() => {})
  }
  return tierVotesState
}

export function broadcastReaction(emoji: string, x: number, y: number) {
  if (reactionAction && myParticipant) {
    reactionAction
      .send({
        id: Math.random().toString(36).slice(2, 9),
        emoji,
        x,
        y,
        senderName: myParticipant.name,
      })
      .catch(() => {})
  }
}

export function leaveRoom() {
  if (activeRoom) {
    try {
      activeRoom.leave()
    } catch {
      /* ignore */
    }
    activeRoom = null
  }
  presenceAction = null
  cursorAction = null
  syncAction = null
  engineAction = null
  duelVoteAction = null
  tierVoteAction = null
  reactionAction = null
  reqSyncAction = null
  myParticipant = null
  peers.clear()
  duelVotesState = { duelKey: '', votes: {} }
  tierVotesState = { trackId: '', votes: {} }
}

export function getLocalSelfId(): string {
  return selfId
}
