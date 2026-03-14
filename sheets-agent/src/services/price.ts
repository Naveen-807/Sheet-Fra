/**
 * Price service — real price feeds from CoinGecko.
 *
 * Fetches DOT/USD, ETH/USD prices with 60-second caching to avoid rate limits.
 * USDT is pegged at $1.00.
 */

import { createLogger } from "../utils/logger"

const log = createLogger("price")

const CACHE_TTL_MS = 60_000 // 60 seconds
const COINGECKO_BASE = "https://api.coingecko.com/api/v3"

interface PriceCache {
  prices: Record<string, number>
  fetchedAt: number
}

let cache: PriceCache | null = null

/**
 * Fetch real prices from CoinGecko.
 * Returns prices in USD as plain numbers.
 */
async function fetchPricesFromCoinGecko(): Promise<Record<string, number>> {
  const apiKey = process.env.COINGECKO_API_KEY
  const headers: Record<string, string> = { Accept: "application/json" }
  if (apiKey) {
    headers["x-cg-demo-api-key"] = apiKey
  }

  const url = `${COINGECKO_BASE}/simple/price?ids=polkadot,ethereum,tether&vs_currencies=usd`

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as Record<string, { usd?: number }>

  const prices: Record<string, number> = {
    DOT_USD: data.polkadot?.usd ?? 0,
    WETH_USD: data.ethereum?.usd ?? 0,
    USDT_USD: data.tether?.usd ?? 1.0,
  }

  log.info("Prices fetched from CoinGecko", prices)
  return prices
}

/**
 * Get current prices, using cache if fresh enough.
 */
export async function getPrices(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.prices
  }

  try {
    const prices = await fetchPricesFromCoinGecko()
    cache = { prices, fetchedAt: Date.now() }
    return prices
  } catch (err) {
    log.warn("Price fetch failed, using stale cache or defaults", { error: (err as Error).message })
    if (cache) return cache.prices
    // Fallback defaults if no cache and API fails
    return { DOT_USD: 0, WETH_USD: 0, USDT_USD: 1.0 }
  }
}

/**
 * Get a single price pair.
 */
export async function getPrice(pair: string): Promise<number> {
  const prices = await getPrices()
  return prices[pair] ?? 0
}

/**
 * Convert prices to the raw 8-decimal string format expected by updatePortfolioTabRich.
 * e.g. price 7.25 -> "725000000"
 */
export function pricesToRaw(prices: Record<string, number>): Record<string, string> {
  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(prices)) {
    raw[key] = Math.round(value * 1e8).toString()
  }
  return raw
}
