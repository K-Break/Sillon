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

describe('moteur de tri hybride', () => {
  it('retrouve exactement l\'ordre de préférence quand l\'auditeur est cohérent', () => {
    const ids = makeIds(60)
    const score = makeScores(ids)
    let s = createEngine(ids, 42)
    s = runTiers(s, score)
    expect(s.phase).toBe('between')
    s = beginDuels(s)
    s = runDuels(s, score)
    expect(s.phase).toBe('done')
    const order = finalOrder(s).map((r) => r.id)
    const expected = [...ids].sort((a, b) => score[b] - score[a])
    expect(order).toEqual(expected)
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
    // On affine le premier palier, puis quelques duels du suivant, et on s'arrête.
    let extra = 3
    while (s.phase === 'duel' && (s.tierIdx === 0 || extra-- > 0)) {
      const d = currentDuel(s)!
      s = answerDuel(s, score[d.cur] > score[d.opp] ? 'cur' : 'opp')
    }
    expect(s.phase).toBe('duel')
    s = finishNow(s)
    const order = finalOrder(s).map((r) => r.id)
    expect(order).toHaveLength(ids.length)
    expect(new Set(order).size).toBe(ids.length)
    expect(tierIsRefined(s, 0)).toBe(true)
    expect(tierIsRefined(s, TIER_COUNT - 1)).toBe(s.buckets[TIER_COUNT - 1].length <= 1)
  })

  it('place un son ex æquo juste derrière son adversaire', () => {
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
