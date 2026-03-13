import { Request, Response, NextFunction } from "express"

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 60 seconds
let cleanupTimerId: ReturnType<typeof setInterval> | null = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key)
  }
}, 60_000)

/** Stop the rate limit cleanup timer (for graceful shutdown). */
export function stopRateLimitTimer(): void {
  if (cleanupTimerId) { clearInterval(cleanupTimerId); cleanupTimerId = null }
}

/**
 * Simple in-memory rate limiter.
 * @param maxRequests Maximum requests per window
 * @param windowMs Time window in milliseconds
 */
export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || "unknown"
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    entry.count++

    res.setHeader("X-RateLimit-Limit", maxRequests)
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count))
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000))

    if (entry.count > maxRequests) {
      res.status(429).json({ error: "Too many requests, please try again later" })
      return
    }

    next()
  }
}
