import type { Track } from '../types'
import { getToken } from './auth'
import { ApiError, startPlayback, transferPlayback } from './api'
import { PlayGate } from './gate'

export interface PlaybackState {
  trackId: string | null
  playing: boolean
  /** 0 → 1 */
  progress: number
  error: string | null
}

export interface Player {
  play(track: Track, startFraction: number): Promise<void>
  toggle(): void
  pause(): void
  getState(): PlaybackState
  subscribe(fn: (s: PlaybackState) => void): () => void
  dispose(): void
}

const IDLE: PlaybackState = { trackId: null, playing: false, progress: 0, error: null }

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

  async play(track: Track, startFraction: number) {
    this.stop()
    this.duration = Math.max(track.durationMs, 1000)
    this.from = startFraction
    this.startedAt = performance.now()
    this.set({ trackId: track.id, playing: true, progress: startFraction, error: null })
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
    else if (this.state.trackId) {
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
        volume: 0.8,
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
    this.set({ trackId, playing: !paused, progress: Math.min(1, Math.max(0, pos / duration)) })
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
    this.player?.pause?.()
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
      if (!this.transferred) {
        await transferPlayback(this.deviceId!)
        this.transferred = true
        await sleep(350)
        if (mine !== this.token) return
      }
      try {
        await startPlayback(this.deviceId!, track.uri, position)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          await transferPlayback(this.deviceId!)
          await sleep(500)
          await startPlayback(this.deviceId!, track.uri, position)
        } else throw e
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

  toggle() {
    this.player?.togglePlay?.()
  }
  pause() {
    this.token++
    this.clearWatchdog()
    this.player?.pause?.()
    this.last = { ...this.last, paused: true, position: this.state.progress * this.last.duration }
    this.set({ playing: false })
  }
  dispose() {
    this.clearWatchdog()
    if (this.cooldownNote !== null) clearTimeout(this.cooldownNote)
    if (this.timer !== null) clearInterval(this.timer)
    this.player?.disconnect?.()
  }
}
