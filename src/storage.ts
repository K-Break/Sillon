import type { EngineState } from './engine'
import type { Track } from './types'

export interface Session {
  sourceName: string
  tracks: Track[]
  engine: EngineState
  demo: boolean
  updatedAt: number
}

export interface Settings {
  autoplay: boolean
  /** Fraction du morceau à partir de laquelle démarre l'extrait (0 = début). */
  start: number
}

export const DEFAULT_SETTINGS: Settings = { autoplay: true, start: 0.3 }

const SESSION_KEY = 'sillon:session'
const SETTINGS_KEY = 'sillon:settings'

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    return s?.engine && Array.isArray(s.tracks) ? s : null
  } catch {
    return null
  }
}

export function saveSession(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    /* stockage plein ou indisponible : on continue sans sauvegarde */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* rien */
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* rien */
  }
}
