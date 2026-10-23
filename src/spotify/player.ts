import type { Track } from '../types'
import { getToken } from './auth'
import { ApiError, pausePlayback, resumePlayback, setPlaybackVolume, startPlayback, transferPlayback } from './api'
import { PlayGate } from './gate'

export function loadSavedVolume(): number {
  try {
    const raw = localStorage.getItem('sillon:volume')
    if (raw !== null) {
      const v = parseFloat(raw)
      if (!Number.isNaN(v) && v >= 0 && v <= 1) return v
    }
  } catch {
    /* ignore */
  }
  return 0.8
}

export function saveStoredVolume(v: number) {
  try {
    localStorage.setItem('sillon:volume', String(v))
  } catch {
    /* ignore */
  }
}

export interface PlaybackState {
  trackId: string | null
  playing: boolean
  /** 0 → 1 */
  progress: number
  /** 0 → 1 */
  volume: number
  muted: boolean
  error: string | null
}

export interface Player {
  play(track: Track, startFraction: number): Promise<void>
  toggle(): void
  pause(): void
  resume(): void
  setVolume(volume: number): Promise<void>
  setMuted(muted: boolean): Promise<void>
  getState(): PlaybackState
  subscribe(fn: (s: PlaybackState) => void): () => void
  dispose(): void
}

const IDLE: PlaybackState = {
  trackId: null,
  playing: false,
  progress: 0,
  volume: loadSavedVolume(),
  muted: false,
  error: null,
}

abstract class Emitter {
  protected state: PlaybackState = { ...IDLE }
  private listeners = new Set<(s: PlaybackState) => void>()
  getState() {
    return this.state
  }
  subscribe(fn: (s: PlaybackState) => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  protected set(patch: Partial<PlaybackState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l(this.state))
  }
}


/* ---------- Mode démo : progression simulée, sans audio ---------- */

export class DemoPlayer extends Emitter implements Player {
  private timer: number | null = null
  private startedAt = 0
  private from = 0
  private duration = 1
  private volume = loadSavedVolume()
  private muted = false

  async play(track: Track, startFraction: number) {
    this.stop()
    this.duration = Math.max(track.durationMs, 1000)
    this.from = startFraction
    this.startedAt = performance.now()
    this.set({
      trackId: track.id,
      playing: true,
      progress: startFraction,
      volume: this.volume,
      muted: this.muted,
      error: null,
    })
    this.timer = window.setInterval(() => this.tick(), 120)
  }
  private tick() {
    const p = this.from + (performance.now() - this.startedAt) / this.duration
    if (p >= 1) {
      this.stop()
      this.set({ playing: false, progress: 1 })
    } else this.set({ progress: p })
  }
  private stop() {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
  toggle() {
    if (this.state.playing) this.pause()
    else this.resume()
  }
  resume() {
    if (this.state.trackId) {
      this.from = this.state.progress
      this.startedAt = performance.now()
      this.set({ playing: true })
      this.timer = window.setInterval(() => this.tick(), 120)
    }
  }
  pause() {
    this.stop()
    this.set({ playing: false })
  }
  async setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume))
    saveStoredVolume(this.volume)
    this.muted = this.volume === 0
    this.set({ volume: this.volume, muted: this.muted })
  }
  async setMuted(muted: boolean) {
    this.muted = muted
    if (!muted && this.volume === 0) {
      this.volume = 0.8
      saveStoredVolume(this.volume)
    }
    this.set({ volume: this.volume, muted: this.muted })
  }
  dispose() {
    this.stop()
  }
}

/* ---------- Spotify Web Playback SDK (Premium) ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Spotify: any
declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void
  }
}

let sdkPromise: Promise<void> | null = null
export function preloadSdk(): Promise<void> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    if (typeof Spotify !== 'undefined') return resolve()
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const s = document.createElement('script')
    s.src = 'https://sdk.scdn.co/spotify-player.js'
    s.async = true
    s.onerror = () => {
      sdkPromise = null
      reject(new Error('Impossible de charger le lecteur Spotify.'))
    }
    document.body.appendChild(s)
  })
  return sdkPromise
}

const WATCHDOG_MS = 8000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class SpotifyPlayer extends Emitter implements Player {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private player: any = null
  private deviceId: string | null = null
  private ready: Promise<void>
  private transferred = false
  private token = 0
  private last = { position: 0, duration: 1, paused: true, at: 0 }
  private timer: number | null = null
  private gate = new PlayGate()
  /** Son réellement chargé et confirmé par le SDK : permet de relire sans nouvelle licence. */
  private loadedId: string | null = null
  private watchdog: number | null = null
  private cooldownNote: number | null = null
  private volume = loadSavedVolume()
  private muted = false

  constructor() {
    super()
    this.ready = this.init()
    this.ready.catch((e: Error) => this.set({ error: e.message }))
  }

  private async init() {
    await preloadSdk()
    await new Promise<void>((resolve, reject) => {
      const player = new Spotify.Player({
        name: 'Sillon',
        volume: this.muted ? 0 : this.volume,
        getOAuthToken: (cb: (t: string) => void) => {
          getToken().then((t) => t && cb(t))
        },
      })
      this.player = player
      try {
        player.activateElement?.()
      } catch {
        /* sans effet si le navigateur n'en a pas besoin */
      }
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        this.deviceId = device_id
        try {
          player.setVolume?.(this.muted ? 0 : this.volume)?.catch?.(() => {})
        } catch {
          /* ignore */
        }
        resolve()
      })
      player.addListener('initialization_error', () =>
        reject(new Error("Ce navigateur ne peut pas lire l'audio Spotify (DRM requis).")),
      )
      player.addListener('authentication_error', () =>
        reject(new Error('Autorisation Spotify refusée pour la lecture. Reconnecte-toi.')),
      )
      player.addListener('account_error', () =>
        reject(new Error('La lecture dans le navigateur nécessite un compte Spotify Premium.')),
      )
      player.addListener('playback_error', () => this.fail())
      player.addListener(
        'player_state_changed',
        (st: {
          position: number
          duration: number
          paused: boolean
          track_window?: { current_track?: { id?: string } }
        } | null) => {
          if (!st) return
          const id = st.track_window?.current_track?.id ?? this.state.trackId
          this.last = { position: st.position, duration: st.duration || 1, paused: st.paused, at: performance.now() }
          if (!st.paused && id && id === this.state.trackId) this.confirm(id)
          this.emitProgress(id)
        },
      )
      player.connect().then((ok: boolean) => {
        if (!ok) reject(new Error('Connexion au lecteur Spotify impossible.'))
      })
    })
    this.timer = window.setInterval(() => this.emitProgress(this.state.trackId), 200)
  }

  private emitProgress(trackId: string | null) {
    const { position, duration, paused, at } = this.last
    const pos = paused ? position : position + (performance.now() - at)
    this.set({
      trackId,
      playing: !paused,
      progress: Math.min(1, Math.max(0, pos / duration)),
      volume: this.volume,
      muted: this.muted,
    })
  }

  private clearWatchdog() {
    if (this.watchdog !== null) clearTimeout(this.watchdog)
    this.watchdog = null
  }

  private confirm(id: string) {
    this.clearWatchdog()
    this.loadedId = id
    this.gate.succeeded()
    if (this.state.error) this.set({ error: null })
  }

  /** Le lancement n'a pas abouti (licence refusée, 429…) : pause imposée plutôt que d'insister. */
  private fail() {
    this.clearWatchdog()
    this.loadedId = null
    this.token++
    this.gate.failed()
    this.player?.pause?.()?.catch?.(() => {})
    if (this.deviceId) {
      pausePlayback(this.deviceId).catch(() => {})
    }
    const note = () => {
      const left = this.gate.check()
      if (left.allowed) {
        this.set({ error: null })
        return
      }
      const s = Math.ceil(left.retryInMs / 1000)
      this.set({
        playing: false,
        error: `Spotify limite temporairement le lancement des sons. Reprise possible dans ${s} s.`,
      })
      this.cooldownNote = window.setTimeout(note, 1000)
    }
    if (this.cooldownNote !== null) clearTimeout(this.cooldownNote)
    note()
  }

  async play(track: Track, startFraction: number) {
    const mine = ++this.token
    const position = Math.floor(track.durationMs * startFraction)
    this.clearWatchdog()

    // Même son déjà chargé : on se replace dans le morceau, sans nouvelle demande de licence.
    if (this.loadedId === track.id && this.player) {
      this.last = { position, duration: track.durationMs || 1, paused: false, at: performance.now() }
      this.set({ trackId: track.id, playing: true, progress: startFraction, error: null })
      try {
        await this.player.seek(position)
        await this.player.resume()
        return
      } catch {
        /* on retombe sur un lancement complet */
      }
    }

    const verdict = this.gate.check()
    if (!verdict.allowed) {
      this.set({ trackId: track.id, playing: false })
      return
    }
    this.set({ trackId: track.id, playing: true, progress: startFraction, error: null })

    // Le dernier clic gagne : un lancement plus récent annule celui qui attend.
    if (verdict.waitMs > 0) {
      await sleep(verdict.waitMs)
      if (mine !== this.token) return
    }
    try {
      await this.ready
      if (mine !== this.token) return
      this.gate.started()
      let started = false
      let lastError: unknown = null

      for (let attempt = 0; attempt < 3 && !started; attempt++) {
        if (mine !== this.token) return
        try {
          if (!this.transferred) {
            try {
              await transferPlayback(this.deviceId!)
              this.transferred = true
              await sleep(250)
            } catch {
              // If transfer fails with 404, device might still be propagating in Spotify's cloud
              if (attempt === 0) {
                await sleep(400)
              }
            }
          }
          if (mine !== this.token) return
          await startPlayback(this.deviceId!, track.uri, position)
          this.transferred = true
          started = true
        } catch (e) {
          lastError = e
          if (e instanceof ApiError && (e.status === 404 || e.status === 502) && attempt < 2) {
            await sleep(attempt === 0 ? 500 : 900)
            continue
          }
          throw e
        }
      }

      if (!started && lastError) {
        throw lastError
      }
      if (mine !== this.token) return
      this.last = { position, duration: track.durationMs || 1, paused: false, at: performance.now() }
      this.watchdog = window.setTimeout(() => {
        if (mine === this.token) this.fail()
      }, WATCHDOG_MS)
    } catch (e) {
      if (mine !== this.token) return
      if (e instanceof ApiError && e.status === 429) this.fail()
      else this.set({ playing: false, error: e instanceof Error ? e.message : 'Lecture impossible.' })
    }
  }

  async toggle() {
    if (this.state.playing) {
      await this.pause()
    } else {
      await this.resume()
    }
  }

  async resume() {
    if (!this.state.trackId) return
    this.token++
    this.clearWatchdog()
    this.last = { ...this.last, paused: false, at: performance.now() }
    this.set({ playing: true })
    try {
      await this.player?.resume?.()
    } catch {
      try {
        await this.player?.togglePlay?.()
      } catch {
        if (this.deviceId) {
          await resumePlayback(this.deviceId).catch(() => {})
        }
      }
    }
  }

  async pause() {
    this.token++
    this.clearWatchdog()
    const duration = this.last.duration || 1
    const pos = Math.min(duration, Math.max(0, this.state.progress * duration))
    this.last = { ...this.last, paused: true, position: pos, at: performance.now() }
    this.set({ playing: false, progress: pos / duration })
    try {
      await this.player?.pause?.()
    } catch {
      if (this.deviceId) {
        await pausePlayback(this.deviceId).catch(() => {})
      }
    }
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, volume))
    this.volume = clamped
    saveStoredVolume(this.volume)
    this.muted = clamped === 0
    const target = this.muted ? 0 : this.volume
    try {
      await this.player?.setVolume?.(target)
    } catch {
      if (this.deviceId) {
        setPlaybackVolume(target * 100, this.deviceId).catch(() => {})
      }
    }
    this.set({ volume: this.volume, muted: this.muted })
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted
    if (!muted && this.volume === 0) {
      this.volume = 0.8
      saveStoredVolume(this.volume)
    }
    const target = this.muted ? 0 : this.volume
    try {
      await this.player?.setVolume?.(target)
    } catch {
      if (this.deviceId) {
        setPlaybackVolume(target * 100, this.deviceId).catch(() => {})
      }
    }
    this.set({ volume: this.volume, muted: this.muted })
  }

  dispose() {
    this.clearWatchdog()
    if (this.cooldownNote !== null) clearTimeout(this.cooldownNote)
    if (this.timer !== null) clearInterval(this.timer)
    this.player?.disconnect?.()
  }
}
