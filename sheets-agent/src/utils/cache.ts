/**
 * Generic typed TTL cache.
 *
 * Replaces ad-hoc Map-based caches throughout the codebase with a single
 * consistent implementation. Supports per-entry TTL override.
 *
 * Usage:
 *   const cache = new TTLCache<PriceData>(60_000)  // 60s default TTL
 *   cache.set("ETH/USD", { price: 3000, decimals: 8, raw: "300000000000" })
 *   const data = cache.get("ETH/USD")  // null if expired
 */

export class TTLCache<T> {
  private store = new Map<string, { data: T; expiresAt: number }>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(private defaultTtlMs: number) {
    // Periodic cleanup to prevent unbounded memory growth
    this.cleanupTimer = setInterval(() => this.cleanup(), Math.max(defaultTtlMs * 2, 60_000))
  }

  get(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.data
  }

  set(key: string, data: T, ttlMs?: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    })
  }

  has(key: string): boolean {
    return this.get(key) !== null
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }

  /** Returns all non-expired entries */
  entries(): Array<[string, T]> {
    const result: Array<[string, T]> = []
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now <= entry.expiresAt) {
        result.push([key, entry.data])
      }
    }
    return result
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
      }
    }
  }

  /** Stop the periodic cleanup timer (for graceful shutdown) */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
}
