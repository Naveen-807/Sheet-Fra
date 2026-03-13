/**
 * Utilities for parsing BigInt-encoded Chainlink oracle values.
 * Centralizes the Number(BigInt(raw)) / 10^decimals pattern
 * used throughout the codebase for price/balance parsing.
 */

/** Parse a raw BigInt string price into a float. Default 8 decimals (Chainlink standard). */
export function parseBigIntPrice(raw: string, decimals: number = 8): number {
  return Number(BigInt(raw)) / Math.pow(10, decimals)
}

/** Parse a raw BigInt string balance into a float with the given token decimals. */
export function parseBigIntBalance(raw: string, decimals: number): number {
  return Number(BigInt(raw)) / Math.pow(10, decimals)
}

/** Compute USD value from raw BigInt balance and raw BigInt price. */
export function computeTokenValueUsd(
  balanceRaw: string,
  priceRaw: string,
  tokenDecimals: number,
  priceDecimals: number = 8,
): number {
  return parseBigIntBalance(balanceRaw, tokenDecimals) * parseBigIntPrice(priceRaw, priceDecimals)
}

/** Format a raw BigInt price as a USD string: "$2,345.67" */
export function formatBigIntPriceUsd(raw: string, decimals: number = 8): string {
  return "$" + parseBigIntPrice(raw, decimals).toFixed(2)
}
