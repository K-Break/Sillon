/**
 * Moteur de tri hybride, pur et sérialisable.
 *
 * Étape 1 : chaque son est placé dans un palier (une seule écoute).
 * Étape 2 : à l'intérieur de chaque palier, tri par insertion binaire :
 *           un son à classer est comparé au son "du milieu" de la liste déjà triée,
 *           ce qui donne un ordre complet en ~log2(n) duels par son.
 *
 * Les paliers sont affinés du meilleur au moins bon : on peut s'arrêter à tout moment,
 * le haut de la liste est alors déjà précis.
 */

export const TIERS = ['Incontournable', 'Très bon', 'Bon', 'Passable', 'Faible'] as const
export const TIER_COUNT = TIERS.length

export type Phase = 'tier' | 'between' | 'duel' | 'done'
export type Choice = 'cur' | 'opp' | 'tie'

export interface Insertion {
  id: string
  lo: number
  hi: number
  /** true : le son à classer est affiché à droite (évite le biais de position). */
  flip: boolean
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
  duels: number
  seed: number
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
    duels: 0,
    seed,
  }
}

/* ---------- Étape 1 : paliers ---------- */

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

/* ---------- Étape 2 : duels ---------- */

function advance(n: EngineState): void {
  for (;;) {
    if (n.cur) {
      if (n.cur.lo >= n.cur.hi) {
        n.lists[n.tierIdx].splice(n.cur.lo, 0, n.cur.id)
        n.cur = null
        continue
      }
      return
    }
    if (n.pending.length > 0) {
      const list = n.lists[n.tierIdx]
      const id = n.pending.shift()!
      if (list.length === 0) {
        list.push(id)
        continue
      }
      n.seed = lcg(n.seed)
      n.cur = { id, lo: 0, hi: list.length, flip: ((n.seed >>> 16) & 1) === 1 }
      continue
    }
    n.tierIdx++
    if (n.tierIdx >= TIER_COUNT) {
      n.tierIdx = TIER_COUNT
      n.phase = 'done'
      return
    }
    n.pending = [...n.buckets[n.tierIdx]]
  }
}

export function beginDuels(s: EngineState): EngineState {
  if (s.phase !== 'between') return s
  const n = clone(s)
  n.phase = 'duel'
  n.lists = Array.from({ length: TIER_COUNT }, () => [])
  n.tierIdx = 0
  n.pending = [...n.buckets[0]]
  n.cur = null
  advance(n)
  return n
}

export interface Duel {
  cur: string
  opp: string
  flip: boolean
}

export function currentDuel(s: EngineState): Duel | null {
  if (s.phase !== 'duel' || !s.cur) return null
  const mid = (s.cur.lo + s.cur.hi) >> 1
  return { cur: s.cur.id, opp: s.lists[s.tierIdx][mid], flip: s.cur.flip }
}

export function answerDuel(s: EngineState, choice: Choice): EngineState {
  if (s.phase !== 'duel' || !s.cur) return s
  const n = clone(s)
  const c = n.cur!
  const mid = (c.lo + c.hi) >> 1
  n.duels++
  if (choice === 'cur') c.hi = mid
  else if (choice === 'opp') c.lo = mid + 1
  else {
    n.lists[n.tierIdx].splice(mid + 1, 0, c.id)
    n.cur = null
  }
  advance(n)
  return n
}

/** Arrête les duels : ce qui est déjà affiné est conservé, le reste garde son ordre d'arrivée. */
export function finishNow(s: EngineState): EngineState {
  if (s.phase !== 'duel' && s.phase !== 'between') return s
  const n = clone(s)
  n.phase = 'done'
  return n
}

/* ---------- Lecture du résultat ---------- */

export interface Ranked {
  id: string
  tier: number
}

export function finalOrder(s: EngineState): Ranked[] {
  const out: Ranked[] = []
  const started = s.phase === 'duel' || s.phase === 'done'
  for (let t = 0; t < TIER_COUNT; t++) {
    let ids: string[]
    if (!started || t > s.tierIdx) ids = s.buckets[t]
    else if (t < s.tierIdx) ids = s.lists[t]
    else {
      ids = [...s.lists[t]]
      if (s.cur) ids.splice(s.cur.lo, 0, s.cur.id)
      ids.push(...s.pending)
    }
    for (const id of ids) out.push({ id, tier: t })
  }
  return out
}

/** Vrai si l'ordre interne du palier est entièrement établi. */
export function tierIsRefined(s: EngineState, t: number): boolean {
  if (s.buckets[t].length <= 1) return true
  return (s.phase === 'duel' || s.phase === 'done') && t < s.tierIdx
}

/* ---------- Estimations ---------- */

const insertCost = (size: number) => Math.ceil(Math.log2(size + 1))

function fullCost(m: number): number {
  let c = 0
  for (let k = 1; k < m; k++) c += insertCost(k)
  return c
}

export function remainingDuels(s: EngineState): number {
  if (s.phase === 'tier' || s.phase === 'between') {
    return s.buckets.reduce((a, b) => a + fullCost(b.length), 0)
  }
  if (s.phase === 'done') return 0
  let c = 0
  for (let t = s.tierIdx + 1; t < TIER_COUNT; t++) c += fullCost(s.buckets[t].length)
  let size = s.lists[s.tierIdx].length
  if (s.cur) {
    c += Math.ceil(Math.log2(s.cur.hi - s.cur.lo + 1))
    size++
  }
  for (let i = 0; i < s.pending.length; i++) c += insertCost(size + i)
  return c
}

export function duelProgress(s: EngineState): number {
  if (s.phase === 'done') return 1
  const rest = remainingDuels(s)
  const total = s.duels + rest
  return total === 0 ? 1 : s.duels / total
}

export function tierProgress(s: EngineState): number {
  return s.ids.length === 0 ? 1 : (s.ids.length - s.queue.length) / s.ids.length
}
