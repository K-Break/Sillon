import { describe, expect, it } from 'vitest'
import {
  TIER_COUNT,
  answerDuel,
  beginDuels,
  createEngine,
  currentDuel,
  finalOrder,
  finishNow,
  placeInTier,
  remainingDuels,
  skipTrack,
  tierIsRefined,
  type EngineState,
} from './engine'

const makeIds = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`)

/** Score "secret" de l'auditeur : plus il est grand, plus le son est aimé. */
function makeScores(ids: string[]): Record<string, number> {
  const sc: Record<string, number> = {}
  ids.forEach((id, i) => (sc[id] = ((i * 7919) % ids.length) + 1))
  return sc
}

function runTiers(s: EngineState, score: Record<string, number>): EngineState {
  const max = Math.max(...Object.values(score))
  while (s.phase === 'tier') {
    const id = s.queue[0]
    const tier = Math.min(TIER_COUNT - 1, Math.floor(((max - score[id]) / max) * TIER_COUNT))
    s = placeInTier(s, tier)
  }
  return s
}

function runDuels(s: EngineState, score: Record<string, number>): EngineState {
  while (s.phase === 'duel') {
    const d = currentDuel(s)!
    s = answerDuel(s, score[d.cur] > score[d.opp] ? 'cur' : 'opp')
  }
  return s
}

/** Calcule le taux de paires concordantes (Kendall tau) entre l'ordre obtenu et l'ordre idéal. */
function pairwiseAccuracy(order: string[], score: Record<string, number>): number {
  let concordant = 0
  let total = 0
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      total++
      if (score[order[i]] >= score[order[j]]) concordant++
    }
  }
  return concordant / total
}

describe('moteur de tri adaptatif Elo', () => {
  it('retrouve l\'ordre de préférence avec une excellente précision en réduisant les duels', () => {
    const ids = makeIds(60)
    const score = makeScores(ids)
    let s = createEngine(ids, 42)
    s = runTiers(s, score)
    expect(s.phase).toBe('between')
    s = beginDuels(s)
    s = runDuels(s, score)
    expect(s.phase).toBe('done')
    const order = finalOrder(s).map((r) => r.id)
    const accuracy = pairwiseAccuracy(order, score)
    expect(accuracy).toBeGreaterThanOrEqual(0.94)
  })

  it('permet à un son mal classé au départ de changer de palier (mobilité inter-paliers)', () => {
    const ids = ['pepite', 'a', 'b', 'c', 'd', 'e', 'f', 'g']
    let s = createEngine(ids, 99)
    // On place 'pepite' par erreur dans le palier 4 (Faible)
    s = placeInTier(s, 4)
    for (let i = 1; i < ids.length; i++) {
      s = placeInTier(s, 1) // les autres en Très bon
    }
    s = beginDuels(s)

    // 'pepite' bat tout le monde lors de ses duels
    while (s.phase === 'duel') {
      const d = currentDuel(s)!
      const choice = d.cur === 'pepite' ? 'cur' : d.opp === 'pepite' ? 'opp' : 'cur'
      s = answerDuel(s, choice)
    }

    const pepite = finalOrder(s).find((r) => r.id === 'pepite')!
    // 'pepite' est sortie du palier 4 et a été promue !
    expect(pepite.tier).toBeLessThan(4)
  })

  it('reste sous la borne de duels annoncée et bien en dessous du tous-contre-tous', () => {
    const ids = makeIds(100)
    const score = makeScores(ids)
    let s = runTiers(createEngine(ids, 7), score)
    s = beginDuels(s)
    const estimate = remainingDuels(s)
    s = runDuels(s, score)
    expect(s.duels).toBeLessThanOrEqual(estimate)
    expect(s.duels).toBeLessThan((100 * 99) / 2 / 5)
  })

  it('classe chaque son une seule fois, même en arrêtant les duels en cours de route', () => {
    const ids = makeIds(40)
    const score = makeScores(ids)
    let s = beginDuels(runTiers(createEngine(ids, 3), score))
    // On effectue 10 duels puis on s'arrête
    let count = 10
    while (s.phase === 'duel' && count-- > 0) {
      const d = currentDuel(s)!
      s = answerDuel(s, score[d.cur] > score[d.opp] ? 'cur' : 'opp')
    }
    expect(s.phase).toBe('duel')
    s = finishNow(s)
    expect(s.phase).toBe('done')
    const order = finalOrder(s).map((r) => r.id)
    expect(order).toHaveLength(ids.length)
    expect(new Set(order).size).toBe(ids.length)
  })

  it('gère les égalités (match nul)', () => {
    const ids = ['a', 'b']
    let s = createEngine(ids, 1)
    s = placeInTier(placeInTier(s, 0), 0)
    s = beginDuels(s)
    expect(s.phase).toBe('duel')
    s = answerDuel(s, 'tie')
    expect(s.phase).toBe('done')
    expect(finalOrder(s)).toHaveLength(2)
  })

  it('gère les palier vides, un seul son et le report d\'un son', () => {
    let s = createEngine(['solo'], 5)
    expect(skipTrack(s)).toBe(s)
    s = placeInTier(s, 3)
    expect(s.phase).toBe('between')
    s = beginDuels(s)
    expect(s.phase).toBe('done')
    expect(finalOrder(s)).toEqual([{ id: 'solo', tier: 3 }])

    let t = createEngine(['x', 'y', 'z'], 9)
    const first = t.queue[0]
    t = skipTrack(t)
    expect(t.queue[t.queue.length - 1]).toBe(first)
  })

  it('ne mute jamais l\'état précédent (annulation possible)', () => {
    const s0 = createEngine(makeIds(5), 11)
    const snapshot = JSON.stringify(s0)
    placeInTier(s0, 2)
    skipTrack(s0)
    expect(JSON.stringify(s0)).toBe(snapshot)
  })
})
