/**
 * Shared constants used across route modules.
 */

export const READ_TIMEOUT_MS = 30_000
export const SUPPORTED_PAIRS = ["DOT/USD", "USDT/USD", "WETH/USD"]
export const SUPPORTED_TOKENS = ["DOT", "USDT", "WETH"]
export const EXECUTABLE_TOKENS = ["DOT", "USDT", "WETH"]
export const TOKEN_TO_PAIR: Record<string, string> = {
  DOT: "DOT/USD",
  PAS: "DOT/USD",
  USDT: "USDT/USD",
  WETH: "WETH/USD",
}
