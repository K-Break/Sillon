/** Authentification Spotify : Authorization Code + PKCE (aucun secret côté navigateur). */

const CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim()

export const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'streaming',
  'user-read-private',
  'user-read-email',
  'user-modify-playback-state',
  'user-read-playback-state',
]

const TOKENS_KEY = 'sillon:tokens'
const VERIFIER_KEY = 'sillon:verifier'
const STATE_KEY = 'sillon:state'

interface Tokens {
  access: string
  refresh: string
  expiresAt: number
}

export const isConfigured = () => Boolean(CLIENT_ID)
export const redirectUri = () => `${location.origin}/callback`

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

async function challengeFrom(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function readTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY)
    return raw ? (JSON.parse(raw) as Tokens) : null
  } catch {
    return null
  }
}

function writeTokens(t: Tokens) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(t))
}

export async function login(): Promise<void> {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID manquant (voir le README).')
  const verifier = randomString(96)
  const state = randomString(16)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem('sillon:redirect_to_import', '1')
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: await challengeFrom(verifier),
    state,
  })
  location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...body }),
  })
  if (!res.ok) throw new Error(`Connexion Spotify refusée (${res.status}).`)
  const json = await res.json()
  const previous = readTokens()
  return {
    access: json.access_token,
    refresh: json.refresh_token ?? previous?.refresh ?? '',
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  }
}

let callbackPromise: Promise<void> | null = null

/** À appeler au chargement : échange le code reçu sur /callback contre des jetons. */
export function handleCallback(): Promise<void> {
  if (callbackPromise) return callbackPromise
  callbackPromise = (async () => {
    const url = new URL(location.href)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    history.replaceState({}, '', '/')
    if (error) throw new Error(error === 'access_denied' ? 'Connexion annulée.' : `Spotify : ${error}`)
    if (!code) return
    const verifier = sessionStorage.getItem(VERIFIER_KEY)
    const state = sessionStorage.getItem(STATE_KEY)
    if (!verifier || state !== url.searchParams.get('state')) {
      throw new Error('Session de connexion invalide, réessaie.')
    }
    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    })
    writeTokens(tokens)
    sessionStorage.removeItem(VERIFIER_KEY)
    sessionStorage.removeItem(STATE_KEY)
  })()
  return callbackPromise
}

export async function getToken(): Promise<string | null> {
  const t = readTokens()
  if (!t) return null
  if (Date.now() < t.expiresAt) return t.access
  if (!t.refresh) return null
  try {
    const fresh = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })
    writeTokens(fresh)
    return fresh.access
  } catch {
    localStorage.removeItem(TOKENS_KEY)
    return null
  }
}

export function logout() {
  localStorage.removeItem(TOKENS_KEY)
}
