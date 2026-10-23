import { describe, expect, it } from 'vitest'
import { PlayGate } from './gate'

function makeGate() {
  let t = 1_000_000
  const gate = new PlayGate(900, 15_000, 120_000, () => t)
  return { gate, advance: (ms: number) => (t += ms) }
}

describe('PlayGate', () => {
  it('laisse passer le premier lancement sans attente', () => {
    const { gate } = makeGate()
    expect(gate.check()).toEqual({ allowed: true, waitMs: 0 })
  })

  it('espace deux lancements rapprochés', () => {
    const { gate, advance } = makeGate()
    gate.started()
    advance(300)
    expect(gate.check()).toEqual({ allowed: true, waitMs: 600 })
    advance(600)
    expect(gate.check()).toEqual({ allowed: true, waitMs: 0 })
  })

  it('bloque pendant la pause après un échec, puis rouvre', () => {
    const { gate, advance } = makeGate()
    expect(gate.failed()).toBe(15_000)
    advance(5_000)
    expect(gate.check()).toEqual({ allowed: false, retryInMs: 10_000 })
    advance(10_000)
    expect(gate.check().allowed).toBe(true)
  })

  it('double la pause à chaque échec consécutif, plafonnée, et repart de zéro après un succès', () => {
    const { gate } = makeGate()
    expect(gate.failed()).toBe(15_000)
    expect(gate.failed()).toBe(30_000)
    expect(gate.failed()).toBe(60_000)
    expect(gate.failed()).toBe(120_000)
    expect(gate.failed()).toBe(120_000)
    gate.succeeded()
    expect(gate.check().allowed).toBe(true)
    expect(gate.failed()).toBe(15_000)
  })
})
