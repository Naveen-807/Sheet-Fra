/**
 * Guardrail state and risk enforcement — cooldowns, daily volume, execution locks.
 */

import type { RiskRules } from "../types"
import { getSheetsClient } from "../services/sheets"
import { getErrorMessage } from "../utils/errors"
import { createLogger } from "../utils/logger"
import { getSpreadsheetId } from "./sheetSingleton"
import { getCachedPrice } from "./priceCache"
import { TOKEN_TO_PAIR } from "./constants"

const log = createLogger("guardrails")

// ── Guardrail state ──────────────────────────────────────────
export let lastExecutionTime = 0
export let dailyVolumeUsd = 0
export let dailyVolumeResetDate = ""

// Per-wallet execution lock to prevent concurrent trade race conditions.
// Two requests cannot pass enforceRiskRules simultaneously for the same wallet.
const executeLocks = new Map<string, Promise<void>>()

export async function withExecutionLock<T>(walletKey: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing lock on this wallet
  while (executeLocks.has(walletKey)) {
    await executeLocks.get(walletKey)
  }
  let releaseLock: () => void
  const lockPromise = new Promise<void>((resolve) => { releaseLock = resolve })
  executeLocks.set(walletKey, lockPromise)
  try {
    return await fn()
  } finally {
    executeLocks.delete(walletKey)
    releaseLock!()
  }
}

export function setLastExecutionTime(time: number): void {
  lastExecutionTime = time
}

export function addDailyVolume(usd: number): void {
  dailyVolumeUsd += usd
}

/** Force-reset daily volume and date (used in tests) */
export function resetDailyVolume(): void {
  dailyVolumeUsd = 0
  dailyVolumeResetDate = ""
}

export function resetDailyVolumeIfNeeded() {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== dailyVolumeResetDate) {
    dailyVolumeUsd = 0
    dailyVolumeResetDate = today
  }
}

export async function enforceRiskRules(
  rules: RiskRules,
  tokenIn: string,
  tokenOut: string,
  amount: number,
  slippageBps: number,
  precomputedTradeUsd?: number
): Promise<string | null> {
  if (slippageBps > rules.maxSlippageBps) {
    return `Slippage ${slippageBps}bps exceeds max ${rules.maxSlippageBps}bps`
  }
  if (!rules.allowedAssets.includes(tokenIn)) {
    return `Token ${tokenIn} is not in allowed assets: ${rules.allowedAssets.join(", ")}`
  }
  if (!rules.allowedAssets.includes(tokenOut)) {
    return `Token ${tokenOut} is not in allowed assets: ${rules.allowedAssets.join(", ")}`
  }
  const elapsed = (Date.now() - lastExecutionTime) / 60_000
  if (lastExecutionTime > 0 && elapsed < rules.cooldownMinutes) {
    return `Cooldown active: ${rules.cooldownMinutes - Math.floor(elapsed)} minutes remaining`
  }
  resetDailyVolumeIfNeeded()
  const tradeUsd = precomputedTradeUsd ?? await estimateTradeUsdValue(tokenIn, amount)
  if (dailyVolumeUsd + tradeUsd > rules.maxDailyVolumeUsd) {
    return `Daily volume would exceed $${rules.maxDailyVolumeUsd} limit (current: $${dailyVolumeUsd.toFixed(2)})`
  }
  return null
}

export async function estimateTradeUsdValue(token: string, amount: number): Promise<number> {
  const upperToken = token.toUpperCase()
  if (upperToken === "USDT") return amount

  const pair = TOKEN_TO_PAIR[upperToken]
  if (!pair) return amount

  const cached = getCachedPrice(pair)
  if (cached) return amount * cached.price

  throw new Error(`Price for ${pair} is unavailable in sheets-only mode. Prime price cache first.`)
}

export async function persistGuardrailState(): Promise<void> {
  const SPREADSHEET_ID = getSpreadsheetId()
  try {
    const sheets = await getSheetsClient()
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Settings'!A14:B16",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          ["Last Execution Time", lastExecutionTime ? new Date(lastExecutionTime).toISOString() : "never"],
          ["Daily Volume USD", dailyVolumeUsd.toFixed(2)],
          ["Daily Volume Date", dailyVolumeResetDate],
        ],
      },
    })
  } catch (err) {
    log.error("Failed to persist guardrail state", { error: getErrorMessage(err) })
  }
}

export async function restoreGuardrailState(): Promise<void> {
  const SPREADSHEET_ID = getSpreadsheetId()
  try {
    const sheets = await getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "'Settings'!A14:B16",
    })
    const rows = res.data.values || []
    for (const row of rows) {
      const key = String(row[0] || "").trim()
      const val = String(row[1] || "").trim()
      if (key === "Last Execution Time" && val !== "never") {
        lastExecutionTime = new Date(val).getTime() || 0
      } else if (key === "Daily Volume USD") {
        dailyVolumeUsd = parseFloat(val) || 0
      } else if (key === "Daily Volume Date") {
        dailyVolumeResetDate = val
      }
    }
    log.info("Restored guardrail state", { lastExecutionTime, dailyVolumeUsd, dailyVolumeResetDate })
  } catch (err) {
    log.warn("Could not restore guardrail state", { error: getErrorMessage(err) })
  }
}
