import { useEffect, useRef, useState } from 'react'
import type { PlaybackState, Player } from './spotify/player'

const IDLE: PlaybackState = { trackId: null, playing: false, progress: 0, error: null }

export function usePlaybackState(player: Player | null): PlaybackState {
  const [state, setState] = useState<PlaybackState>(IDLE)
  useEffect(() => {
    if (!player) {
      setState(IDLE)
      return
    }
    setState(player.getState())
    return player.subscribe(setState)
  }, [player])
  return state
}

/** Écoute le clavier, sauf pendant la saisie dans un champ. */
export function useHotkeys(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      ref.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
