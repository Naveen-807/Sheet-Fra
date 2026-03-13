/**
 * Shared constants used across route modules.
 */

export const READ_TIMEOUT_MS = 30_000
export const SUPPORTED_PAIRS = ["ETH/USD", "BTC/USD", "LINK/USD", "USDC/USD", "PYUSD/USD"]
export const SUPPORTED_TOKENS = ["ETH", "USDC", "WETH", "LINK", "PYUSD"]
export const EXECUTABLE_TOKENS = ["WETH", "USDC", "LINK", "PYUSD"]
export const TOKEN_TO_PAIR: Record<string, string> = {
  ETH: "ETH/USD",
  WETH: "ETH/USD",
  BTC: "BTC/USD",
  LINK: "LINK/USD",
  USDC: "USDC/USD",
  PYUSD: "PYUSD/USD",
}
