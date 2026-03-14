/**
 * Portfolio service — aggregates real on-chain balances with real prices.
 */

import { getTokenBalances, formatTokenBalance, type TokenBalances } from "./blockchain"
import { getPrices, pricesToRaw } from "./price"
import { POLKADOT_HUB_TESTNET } from "../config/polkadot-hub"
import { createLogger } from "../utils/logger"

const log = createLogger("portfolio")

// Token decimal configuration
const TOKEN_DECIMALS: Record<string, number> = {
  DOT: 10,
  USDT: 6,
  WETH: 18,
}

export interface PortfolioToken {
  symbol: string
  name: string
  balance: string       // human-readable
  balanceRaw: string    // raw bigint string
  decimals: number
  priceUsd: number
  valueUsd: number
}

export interface Portfolio {
  walletAddress: string
  network: string
  totalValueUsd: number
  tokens: PortfolioToken[]
  prices: Record<string, number>  // e.g. { DOT_USD: 7.25, ... }
  timestamp: number
}

const TOKEN_NAMES: Record<string, string> = {
  DOT: "Polkadot",
  USDT: "Tether USD",
  WETH: "Wrapped Ether",
}

/**
 * Fetch a complete portfolio for the given wallet address.
 * Combines real on-chain balances with real CoinGecko prices.
 */
export async function fetchPortfolio(walletAddress: string): Promise<Portfolio> {
  const [balances, prices] = await Promise.all([
    getTokenBalances(walletAddress),
    getPrices(),
  ])

  const tokens: PortfolioToken[] = []
  let totalValueUsd = 0

  for (const [symbol, rawBalance] of Object.entries(balances) as [keyof TokenBalances, string][]) {
    const decimals = TOKEN_DECIMALS[symbol] ?? 18
    const humanBalance = formatTokenBalance(rawBalance, decimals)
    const pricePair = `${symbol}_USD`
    const priceUsd = prices[pricePair] ?? 0
    const valueUsd = parseFloat(humanBalance) * priceUsd

    tokens.push({
      symbol,
      name: TOKEN_NAMES[symbol] ?? symbol,
      balance: humanBalance,
      balanceRaw: rawBalance,
      decimals,
      priceUsd,
      valueUsd,
    })

    totalValueUsd += valueUsd
  }

  log.info("Portfolio fetched", {
    wallet: walletAddress.slice(0, 10) + "...",
    totalValueUsd: totalValueUsd.toFixed(2),
    tokenCount: tokens.filter(t => t.valueUsd > 0).length,
  })

  return {
    walletAddress,
    network: POLKADOT_HUB_TESTNET.name,
    totalValueUsd,
    tokens,
    prices,
    timestamp: Date.now(),
  }
}

/**
 * Convert a Portfolio to the format expected by updatePortfolioTabRich.
 */
export function portfolioToSheetData(portfolio: Portfolio) {
  const rawPrices = pricesToRaw(portfolio.prices)
  const rawBalances: Record<string, string> = {}
  for (const token of portfolio.tokens) {
    rawBalances[token.symbol] = token.balanceRaw
  }

  return {
    walletAddress: portfolio.walletAddress,
    network: portfolio.network,
    totalValueUsd: Math.round(portfolio.totalValueUsd * 1e8).toString(),
    prices: rawPrices,
    balances: rawBalances,
    timestamp: portfolio.timestamp,
  }
}

/**
 * Format a portfolio for chat display.
 */
export function formatPortfolioForChat(portfolio: Portfolio): string {
  const lines = [
    `Portfolio on ${portfolio.network}:`,
    `  Total Value: $${portfolio.totalValueUsd.toFixed(2)}`,
    `  Wallet: ${portfolio.walletAddress}`,
    "",
  ]

  for (const token of portfolio.tokens) {
    if (parseFloat(token.balance) > 0 || token.symbol === "DOT") {
      const pct = portfolio.totalValueUsd > 0
        ? ((token.valueUsd / portfolio.totalValueUsd) * 100).toFixed(1)
        : "0.0"
      lines.push(`  ${token.symbol}: ${token.balance} ($${token.valueUsd.toFixed(2)}, ${pct}%)`)
    }
  }

  lines.push("")
  lines.push(`  Last updated: ${new Date(portfolio.timestamp).toISOString()}`)

  return lines.join("\n")
}
