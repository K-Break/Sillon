import type { ReactionPayload, RemoteCursor } from '../multiplayer/types'

interface Props {
  cursors: RemoteCursor[]
  reactions?: ReactionPayload[]
}

export function MultiplayerCursors({ cursors, reactions = [] }: Props) {
  return (
    <div className="multiplayer-overlay" aria-hidden="true">
      {/* Remote Cursors */}
      {cursors.map((cursor) => {
        const xPercent = Math.min(100, Math.max(0, cursor.x * 100))
        const yPercent = Math.min(100, Math.max(0, cursor.y * 100))

        return (
          <div
            key={cursor.id}
            className={`mp-cursor${cursor.clicking ? ' clicking' : ''}`}
            style={{
              left: `${xPercent}%`,
              top: `${yPercent}%`,
            }}
          >
            {/* SVG Cursor Pointer */}
            <svg
              className="mp-cursor-pointer"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4.5 3.5L11.5 20.5L14.5 13.5L21.5 10.5L4.5 3.5Z"
                fill={cursor.color}
                stroke="#0e0f12"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>

            {/* User Pill Badge */}
            <div className="mp-cursor-tag" style={{ backgroundColor: cursor.color }}>
              <span className="mp-cursor-name">{cursor.name}</span>
            </div>

            {/* Click Ripple Effect */}
            {cursor.clicking && <div className="mp-cursor-ripple" style={{ borderColor: cursor.color }} />}
          </div>
        )
      })}

      {/* Floating Reactions */}
      {reactions.map((rx) => {
        const xPercent = Math.min(95, Math.max(5, rx.x * 100))
        const yPercent = Math.min(95, Math.max(5, rx.y * 100))

        return (
          <div
            key={rx.id}
            className="mp-floating-reaction"
            style={{
              left: `${xPercent}%`,
              top: `${yPercent}%`,
            }}
          >
            <span className="emoji">{rx.emoji}</span>
            <small className="sender">{rx.senderName}</small>
          </div>
        )
      })}
    </div>
  )
}
