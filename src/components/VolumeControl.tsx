import { VolumeHighIcon, VolumeLowIcon, VolumeMuteIcon } from './icons'

interface Props {
  volume: number
  muted: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  className?: string
  showPercent?: boolean
}

export function VolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  className = '',
  showPercent = true,
}: Props) {
  const effectiveVolume = muted ? 0 : volume
  const percent = Math.round(effectiveVolume * 100)

  return (
    <div className={`volume-mixer ${className}`.trim()} title={`Volume : ${percent}%`}>
      <button
        type="button"
        className="volume-mute-btn"
        onClick={onToggleMute}
        aria-label={muted || effectiveVolume === 0 ? 'Activer le son' : 'Couper le son'}
        title={muted || effectiveVolume === 0 ? 'Activer le son' : 'Couper le son'}
      >
        {muted || effectiveVolume === 0 ? (
          <VolumeMuteIcon size={16} />
        ) : effectiveVolume < 0.5 ? (
          <VolumeLowIcon size={16} />
        ) : (
          <VolumeHighIcon size={16} />
        )}
      </button>

      <div className="volume-slider-wrap">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={effectiveVolume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="volume-slider"
          aria-label="Contrôle du volume"
          style={{
            background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, var(--line) ${percent}%, var(--line) 100%)`,
          }}
        />
      </div>

      {showPercent && <span className="volume-percent">{percent}%</span>}
    </div>
  )
}
