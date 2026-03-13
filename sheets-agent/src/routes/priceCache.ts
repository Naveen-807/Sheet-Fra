/**
 * Price cache — wraps a TTLCache for token pair prices.
 */

import { TTLCache } from "../utils/cache"

const priceCache = new TTLCache<{ price: number; decimals: number; raw: string }>(60_000)

export function getCachedPrice(pair: string) {
  return priceCache.get(pair)
}

export function setCachedPrice(pair: string, data: { price: number; decimals: number; raw: string }) {
  priceCache.set(pair, data)
}
