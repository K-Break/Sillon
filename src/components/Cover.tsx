import type { Track } from '../types'
import type { PlaybackState } from '../spotify/player'
import { PauseIcon, PlayIcon } from './icons'

function hue(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return h
}

/** Pochette : image Spotify, ou dégradé discret dérivé de l'identifiant. */
export function Cover({ track }: { track: Pick<Track, 'id' | 'image'> }) {
  if (track.image) return <img className="cover" src={track.image} alt="" loading="lazy" draggable={false} />
  const h = hue(track.id)
  return (
    <div
      className="cover"
      style={{ background: `linear-gradient(145deg, hsl(${h} 16% 34%), hsl(${(h + 48) % 360} 20% 20%))` }}
    />
  )
}

interface PlayCoverProps {
  track: Track
  state: PlaybackState
  onPress: () => void
  label?: string
}

/** Pochette cliquable : lecture / pause, avec fine barre de progression. */
export function PlayCover({ track, state, onPress, label }: PlayCoverProps) {
  const active = state.trackId === track.id
  const playing = active && state.playing
  return (
    <button
      type="button"
      className={`cover-btn${playing ? ' is-playing' : ''}`}
      onClick={onPress}
      aria-label={`${playing ? 'Mettre en pause' : 'Écouter'} ${label ?? track.name}`}
    >
      <Cover track={track} />
      {playing && (
        <span className="eq" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="cover-play">{playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}</span>
      <span className="scrub" aria-hidden="true">
        <i style={{ transform: `scaleX(${active ? state.progress : 0})` }} />
      </span>
    </button>
  )
}
