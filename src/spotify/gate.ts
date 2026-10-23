/**
 * Régulateur de lancements de lecture.
 *
 * Chaque lancement d'un nouveau son déclenche, côté Spotify, une demande de licence de lecture
 * (le 429 sur /widevine-license). Spotify ne documente pas cette limite : on réduit donc le nombre
 * de demandes (espacement minimal, le dernier clic gagne) et, si un lancement échoue, on s'impose
 * une pause de plus en plus longue plutôt que d'insister.
 */
export type GateDecision = { allowed: true; waitMs: number } | { allowed: false; retryInMs: number }

export class PlayGate {
  private lastStart = -Infinity
  private cooldownUntil = 0
  private failures = 0

  constructor(
    private readonly minGapMs = 900,
    private readonly baseCooldownMs = 15_000,
    private readonly maxCooldownMs = 120_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  check(): GateDecision {
    const t = this.now()
    if (t < this.cooldownUntil) return { allowed: false, retryInMs: this.cooldownUntil - t }
    return { allowed: true, waitMs: Math.max(0, this.lastStart + this.minGapMs - t) }
  }

  /** À appeler au moment où le lancement part réellement. */
  started() {
    this.lastStart = this.now()
  }

  /** Un lancement a échoué : renvoie la durée de pause imposée (doublée à chaque échec consécutif). */
  failed(): number {
    this.failures++
    const ms = Math.min(this.maxCooldownMs, this.baseCooldownMs * 2 ** (this.failures - 1))
    this.cooldownUntil = this.now() + ms
    return ms
  }

  /** Un lancement a abouti : on repart de zéro. */
  succeeded() {
    this.failures = 0
    this.cooldownUntil = 0
  }
}
