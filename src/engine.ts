/**
 * Moteur de tri adaptatif basé sur un système Elo dynamique amorcé par paliers.
 *
 * Étape 1 : Chaque morceau est placé dans un palier (Incontournable, Très bon...).
 *           Ce palier définit son score Elo initial.
 *
 * Étape 2 : Duels intelligents (matchmaking suisse / proximité de score) :
 *           - Les morceaux aux scores proches s'affrontent (gain d'information maximal).
 *           - Mobilité totale : un morceau sous-évalué au départ qui gagne ses duels
 *             monte en score et affronte des morceaux des paliers supérieurs. Il n'est
 *             plus prisonnier de son groupe initial !
 *           - Nombre de duels réduit de 40% à 60% par rapport à un tri exhaustif,
 *             tout en garantissant une excellente pertinence globale.
 *           - Arrêt possible à tout moment ("Terminer maintenant") avec un classement
 *             déjà ordonné et pertinent.
 */

export const TIERS = ['Incontournable', 'Très bon', 'Bon', 'Passable', 'Faible'] as const
export const TIER_COUNT = TIERS.length

export type Phase = 'tier' | 'between' | 'duel' | 'done'
export type Choice = 'cur' | 'opp' | 'tie'

export interface Insertion {
  id: string
  lo: number
  hi: number
  flip: boolean
}

export interface Duel {
  cur: string
  opp: string
  flip: boolean
  tierCur?: number
  tierOpp?: number
}

export interface EngineState {
  ids: string[]
  phase: Phase
  queue: string[]
  tierOf: Record<string, number>
  buckets: string[][]
  lists: string[][]
  tierIdx: number
  pending: string[]
  cur: Insertion | null
  curDuel: Duel | null
  duels: number
  targetDuels: number
  seed: number
  ratings: Record<string, number>
  matchesPlayed: Record<string, number>
  streaks: Record<string, number>
  playedPairs: string[]
}

const lcg = (s: number) => (Math.imul(s, 1664525) + 1013904223) >>> 0

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed >>> 0
  for (let i = a.length - 1; i > 0; i--) {
    s = lcg(s)
    const j = (s >>> 8) % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const clone = (s: EngineState): EngineState => structuredClone(s)

/** Paliers de score Elo de base */
const BASE_TIER_SCORES = [2000, 1650, 1350, 1050, 750] as const

/** Détermine le palier (0 à 4) selon le score Elo actuel */
export function getTierFromRating(r: number): number {
  if (r >= 1825) return 0 // Incontournable
  if (r >= 1500) return 1 // Très bon
  if (r >= 1200) return 2 // Bon
  if (r >= 900) return 3 // Passable
  return 4 // Faible
}

/** Calcule le nombre cible de duels (~1.6 duel par morceau) */
export function calculateTargetDuels(n: number): number {
  if (n <= 1) return 0
  if (n === 2) return 1
  if (n <= 6) return n
  if (n <= 15) return Math.round(n * 1.4)
  return Math.round(n * 1.6)
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

export function createEngine(ids: string[], seed: number = Date.now() >>> 0): EngineState {
  return {
    ids: [...ids],
    phase: ids.length > 0 ? 'tier' : 'done',
    queue: shuffle(ids, seed),
    tierOf: {},
    buckets: Array.from({ length: TIER_COUNT }, () => []),
    lists: Array.from({ length: TIER_COUNT }, () => []),
    tierIdx: 0,
    pending: [],
    cur: null,
    curDuel: null,
    duels: 0,
    targetDuels: calculateTargetDuels(ids.length),
    seed,
    ratings: {},
    matchesPlayed: {},
    streaks: {},
    playedPairs: [],
  }
}

/* ---------- Étape 1 : Paliers ---------- */

export function placeInTier(s: EngineState, tier: number): EngineState {
  if (s.phase !== 'tier' || s.queue.length === 0 || tier < 0 || tier >= TIER_COUNT) return s
  const n = clone(s)
  const id = n.queue.shift()!
  n.tierOf[id] = tier
  n.buckets[tier].push(id)
  if (n.queue.length === 0) n.phase = 'between'
  return n
}

/** Repousse le son courant à la fin de la file. */
export function skipTrack(s: EngineState): EngineState {
  if (s.phase !== 'tier' || s.queue.length < 2) return s
  const n = clone(s)
  n.queue.push(n.queue.shift()!)
  return n
}

/* ---------- Étape 2 : Matchmaking & Duels Elo ---------- */

/**
 * Sélectionne le prochain duel le plus informatif :
 * 1. Choisit un morceau prioritaire (ayant disputé le moins de duels).
 * 2. Trouve un adversaire proche en score Elo qui n'a pas encore été affronté.
 */
function pickNextDuel(n: EngineState, lastPlayedId: string | null): Duel | null {
  const ids = n.ids
  if (ids.length < 2) return null

  // Morceaux triés par nombre de matchs joués (croissant)
  const sortedByMatches = [...ids].sort((a, b) => {
    const ma = n.matchesPlayed[a] ?? 0
    const mb = n.matchesPlayed[b] ?? 0
    if (ma !== mb) return ma - mb
    // Si égalité de matchs, varier selon l'aléa
    n.seed = lcg(n.seed)
    return (n.seed & 1) === 0 ? -1 : 1
  })

  // Évite de reprendre immédiatement le même son d'affilée si possible
  let a = sortedByMatches[0]
  if (a === lastPlayedId && sortedByMatches.length > 2 && (n.matchesPlayed[sortedByMatches[1]] ?? 0) <= (n.matchesPlayed[a] ?? 0)) {
    a = sortedByMatches[1]
  }

  const playedSet = new Set(n.playedPairs)
  const candidates = ids.filter((id) => id !== a)

  // Trouve l'adversaire b idéal pour a
  candidates.sort((x, y) => {
    const pairX = pairKey(a, x)
    const pairY = pairKey(a, y)
    const playedX = playedSet.has(pairX) ? 5000 : 0
    const playedY = playedSet.has(pairY) ? 5000 : 0

    const diffX = Math.abs((n.ratings[a] ?? 1200) - (n.ratings[x] ?? 1200))
    const diffY = Math.abs((n.ratings[a] ?? 1200) - (n.ratings[y] ?? 1200))

    const matchesX = (n.matchesPlayed[x] ?? 0) * 35
    const matchesY = (n.matchesPlayed[y] ?? 0) * 35

    return diffX + matchesX + playedX - (diffY + matchesY + playedY)
  })

  const b = candidates[0]
  if (!b) return null

  n.seed = lcg(n.seed)
  const flip = ((n.seed >>> 16) & 1) === 1

  const tierA = getTierFromRating(n.ratings[a] ?? 1200)
  const tierB = getTierFromRating(n.ratings[b] ?? 1200)

  return {
    cur: a,
    opp: b,
    flip,
    tierCur: tierA,
    tierOpp: tierB,
  }
}

export function beginDuels(s: EngineState): EngineState {
  if (s.phase !== 'between') return s
  const n = clone(s)
  n.phase = 'duel'
  n.duels = 0
  n.targetDuels = calculateTargetDuels(n.ids.length)
  n.playedPairs = []
  n.ratings = {}
  n.matchesPlayed = {}
  n.streaks = {}

  // Initialisation des scores Elo selon les paliers de l'étape 1
  for (let t = 0; t < TIER_COUNT; t++) {
    const bucket = n.buckets[t]
    const count = bucket.length
    bucket.forEach((id, i) => {
      // Petite dispersion déterministe pour éviter les égalités parfaites initiales
      const spread = count <= 1 ? 0 : (i - (count - 1) / 2) * 12
      n.seed = lcg(n.seed)
      const jitter = (n.seed % 15) - 7
      n.ratings[id] = BASE_TIER_SCORES[t] + spread + jitter
      n.matchesPlayed[id] = 0
      n.streaks[id] = 0
    })
  }

  const firstDuel = pickNextDuel(n, null)
  if (!firstDuel || n.targetDuels === 0) {
    n.phase = 'done'
    n.cur = null
    n.curDuel = null
    return n
  }

  n.curDuel = firstDuel
  n.tierIdx = Math.min(firstDuel.tierCur ?? 0, firstDuel.tierOpp ?? 0)
  n.cur = { id: firstDuel.cur, lo: 0, hi: 1, flip: firstDuel.flip }
  return n
}

export function currentDuel(s: EngineState): Duel | null {
  if (s.phase !== 'duel') return null
  return s.curDuel ?? null
}

export function answerDuel(s: EngineState, choice: Choice): EngineState {
  if (s.phase !== 'duel' || !s.curDuel) return s
  const n = clone(s)
  const duel = n.curDuel
  if (!duel) return s
  const a = duel.cur
  const b = duel.opp

  const Ra = n.ratings[a] ?? 1200
  const Rb = n.ratings[b] ?? 1200

  // Espérance de gain Elo
  const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400))
  const Eb = 1 - Ea

  const matchesA = n.matchesPlayed[a] ?? 0
  const matchesB = n.matchesPlayed[b] ?? 0
  const streakA = n.streaks[a] ?? 0
  const streakB = n.streaks[b] ?? 0

  // Facteur K dynamique : élevé au début et en série de victoires pour permettre
  // à un morceau de monter rapidement dans les paliers supérieurs
  const Ka = Math.min(110, 48 + (matchesA <= 2 ? 36 : 0) + (choice === 'cur' ? streakA * 16 : 0))
  const Kb = Math.min(110, 48 + (matchesB <= 2 ? 36 : 0) + (choice === 'opp' ? streakB * 16 : 0))

  let Sa = 0.5
  let Sb = 0.5

  if (choice === 'cur') {
    Sa = 1
    Sb = 0
    n.streaks[a] = streakA + 1
    n.streaks[b] = 0
  } else if (choice === 'opp') {
    Sa = 0
    Sb = 1
    n.streaks[b] = streakB + 1
    n.streaks[a] = 0
  } else {
    n.streaks[a] = 0
    n.streaks[b] = 0
  }

  n.ratings[a] = Math.round(Ra + Ka * (Sa - Ea))
  n.ratings[b] = Math.round(Rb + Kb * (Sb - Eb))

  n.matchesPlayed[a] = matchesA + 1
  n.matchesPlayed[b] = matchesB + 1
  n.playedPairs.push(pairKey(a, b))
  n.duels++

  // Vérifie si l'objectif de duels est atteint
  if (n.duels >= n.targetDuels) {
    n.phase = 'done'
    n.cur = null
    n.curDuel = null
    return n
  }

  const next = pickNextDuel(n, a)
  if (!next) {
    n.phase = 'done'
    n.cur = null
    n.curDuel = null
    return n
  }

  n.curDuel = next
  n.tierIdx = Math.min(next.tierCur ?? 0, next.tierOpp ?? 0)
  n.cur = { id: next.cur, lo: 0, hi: 1, flip: next.flip }
  return n
}

/** Arrête les duels : le classement actuel par score Elo est conservé immédiatement. */
export function finishNow(s: EngineState): EngineState {
  if (s.phase !== 'duel' && s.phase !== 'between') return s
  const n = clone(s)
  n.phase = 'done'
  n.cur = null
  n.curDuel = null
  return n
}

/* ---------- Lecture du résultat ---------- */

export interface Ranked {
  id: string
  tier: number
}

export function finalOrder(s: EngineState): Ranked[] {
  // Avant les duels : ordre d'arrivée dans les paliers
  if (s.phase === 'tier') {
    const out: Ranked[] = []
    for (let t = 0; t < TIER_COUNT; t++) {
      for (const id of s.buckets[t]) {
        out.push({ id, tier: t })
      }
    }
    return out
  }

  // Dès que les duels ont commencé ou sont terminés : classement trié par score Elo
  const sortedIds = [...s.ids].sort((a, b) => {
    const ra = s.ratings[a] ?? (BASE_TIER_SCORES[s.tierOf[a] ?? 2] || 1200)
    const rb = s.ratings[b] ?? (BASE_TIER_SCORES[s.tierOf[b] ?? 2] || 1200)
    return rb - ra
  })

  return sortedIds.map((id) => {
    const r = s.ratings[id]
    const tier = r !== undefined ? getTierFromRating(r) : (s.tierOf[id] ?? 2)
    return { id, tier }
  })
}

/** Vrai si le palier est considéré comme affiné. */
export function tierIsRefined(s: EngineState, t: number): boolean {
  if (s.phase === 'done') return true
  if (s.phase !== 'duel') return false
  const inTier = s.ids.filter((id) => getTierFromRating(s.ratings[id] ?? 1200) === t)
  if (inTier.length <= 1) return true
  return inTier.every((id) => (s.matchesPlayed[id] ?? 0) >= 1)
}

/* ---------- Estimations & Progression ---------- */

export function remainingDuels(s: EngineState): number {
  if (s.phase === 'tier' || s.phase === 'between') {
    return calculateTargetDuels(s.ids.length)
  }
  if (s.phase === 'done') return 0
  return Math.max(0, s.targetDuels - s.duels)
}

export function duelProgress(s: EngineState): number {
  if (s.phase === 'done') return 1
  const target = Math.max(1, s.targetDuels || calculateTargetDuels(s.ids.length))
  return Math.min(1, s.duels / target)
}

export function tierProgress(s: EngineState): number {
  return s.ids.length === 0 ? 1 : (s.ids.length - s.queue.length) / s.ids.length
}
