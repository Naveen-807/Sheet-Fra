import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { TTLCache } from "../../utils/cache"

describe("TTLCache", () => {
  let cache: TTLCache<string>

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new TTLCache<string>(1000) // 1 second default TTL
  })

  afterEach(() => {
    cache.destroy()
    vi.useRealTimers()
  })

  // ----- get -----
  it("returns null for a missing key", () => {
    expect(cache.get("nonexistent")).toBeNull()
  })

  it("stores and retrieves a value before expiry", () => {
    cache.set("key1", "value1")
    expect(cache.get("key1")).toBe("value1")
  })

  it("returns null for an expired entry", () => {
    cache.set("key1", "value1")
    vi.advanceTimersByTime(1001) // just past the 1000ms TTL
    expect(cache.get("key1")).toBeNull()
  })

  it("returns the value right at TTL boundary (not yet expired)", () => {
    cache.set("key1", "value1")
    vi.advanceTimersByTime(999) // still within TTL
    expect(cache.get("key1")).toBe("value1")
  })

  it("deletes expired entries from the store when accessed via get", () => {
    cache.set("key1", "value1")
    vi.advanceTimersByTime(1001)
    cache.get("key1") // triggers lazy delete
    // The internal store size should be 0 after the expired entry is cleaned up
    expect(cache.size).toBe(0)
  })

  // ----- has -----
  it("has() returns true for an existing non-expired key", () => {
    cache.set("key1", "value1")
    expect(cache.has("key1")).toBe(true)
  })

  it("has() returns false for a missing key", () => {
    expect(cache.has("missing")).toBe(false)
  })

  it("has() returns false for an expired key", () => {
    cache.set("key1", "value1")
    vi.advanceTimersByTime(1001)
    expect(cache.has("key1")).toBe(false)
  })

  // ----- delete -----
  it("delete() removes an existing key and returns true", () => {
    cache.set("key1", "value1")
    expect(cache.delete("key1")).toBe(true)
    expect(cache.get("key1")).toBeNull()
  })

  it("delete() returns false for a non-existent key", () => {
    expect(cache.delete("nope")).toBe(false)
  })

  // ----- size -----
  it("size reflects the number of stored entries (including expired ones in the internal store)", () => {
    cache.set("a", "1")
    cache.set("b", "2")
    cache.set("c", "3")
    expect(cache.size).toBe(3)
  })

  it("size decreases after delete()", () => {
    cache.set("a", "1")
    cache.set("b", "2")
    cache.delete("a")
    expect(cache.size).toBe(1)
  })

  // ----- entries -----
  it("entries() returns all non-expired entries", () => {
    cache.set("a", "1")
    cache.set("b", "2")
    cache.set("c", "3")

    const entries = cache.entries()
    expect(entries).toHaveLength(3)
    expect(entries).toEqual(
      expect.arrayContaining([
        ["a", "1"],
        ["b", "2"],
        ["c", "3"],
      ])
    )
  })

  it("entries() excludes expired entries", () => {
    cache.set("short", "gone", 500)  // expires in 500ms
    cache.set("long", "stays", 2000)  // expires in 2000ms

    vi.advanceTimersByTime(600) // past the 500ms TTL but within the 2000ms TTL

    const entries = cache.entries()
    expect(entries).toEqual([["long", "stays"]])
  })

  it("entries() returns an empty array when all entries are expired", () => {
    cache.set("a", "1")
    cache.set("b", "2")
    vi.advanceTimersByTime(1001)

    expect(cache.entries()).toEqual([])
  })

  // ----- clear -----
  it("clear() removes all entries", () => {
    cache.set("a", "1")
    cache.set("b", "2")
    cache.set("c", "3")
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get("a")).toBeNull()
    expect(cache.get("b")).toBeNull()
    expect(cache.get("c")).toBeNull()
  })

  // ----- per-entry TTL override -----
  it("per-entry TTL override: shorter TTL expires sooner", () => {
    cache.set("default", "uses-default-ttl")
    cache.set("short", "expires-fast", 200)

    vi.advanceTimersByTime(300)

    expect(cache.get("short")).toBeNull()        // expired (200ms TTL)
    expect(cache.get("default")).toBe("uses-default-ttl")  // still alive (1000ms TTL)
  })

  it("per-entry TTL override: longer TTL lives longer", () => {
    cache.set("default", "default-ttl")
    cache.set("long", "lives-long", 5000)

    vi.advanceTimersByTime(1001)

    expect(cache.get("default")).toBeNull()       // expired (1000ms TTL)
    expect(cache.get("long")).toBe("lives-long")  // still alive (5000ms TTL)
  })

  // ----- overwrite behavior -----
  it("set() overwrites an existing entry with new value and TTL", () => {
    cache.set("key", "old-value")
    cache.set("key", "new-value", 3000)

    expect(cache.get("key")).toBe("new-value")

    vi.advanceTimersByTime(1001)
    // The old 1000ms TTL would have expired, but the new 3000ms TTL keeps it alive
    expect(cache.get("key")).toBe("new-value")

    vi.advanceTimersByTime(2000)
    expect(cache.get("key")).toBeNull()
  })

  // ----- typed values -----
  it("works with non-string value types", () => {
    const numCache = new TTLCache<number>(1000)
    numCache.set("count", 42)
    expect(numCache.get("count")).toBe(42)
    numCache.destroy()
  })

  it("works with object value types", () => {
    const objCache = new TTLCache<{ price: number; symbol: string }>(1000)
    const data = { price: 3000, symbol: "ETH" }
    objCache.set("ETH/USD", data)
    expect(objCache.get("ETH/USD")).toEqual(data)
    objCache.destroy()
  })

  // ----- periodic cleanup -----
  it("periodic cleanup removes expired entries", () => {
    cache.set("a", "1", 500)
    cache.set("b", "2", 500)
    cache.set("c", "3") // default 1000ms

    // Advance past the short TTL
    vi.advanceTimersByTime(600)

    // Internal store still has all 3 entries (lazy deletion hasn't triggered for a/b)
    expect(cache.size).toBe(3)

    // Advance to trigger the cleanup timer (Math.max(1000 * 2, 60_000) = 60_000ms)
    vi.advanceTimersByTime(60_000)

    // After cleanup, expired entries should be removed
    // 'a' and 'b' expired at 500ms, 'c' expired at 1000ms -- all gone by now
    expect(cache.size).toBe(0)
  })

  // ----- destroy -----
  it("destroy() stops the periodic cleanup timer", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval")
    cache.destroy()
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  it("destroy() is safe to call multiple times", () => {
    cache.destroy()
    cache.destroy() // should not throw
  })
})
