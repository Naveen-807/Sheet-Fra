/**
 * Barrel re-export for shared state and utilities.
 *
 * All logic has been decomposed into focused modules.
 * This file re-exports everything so that existing imports
 * from "./shared" continue to work without changes.
 */

// ── Spreadsheet singleton ────────────────────────────────────
export { getSpreadsheetId, setSpreadsheetId } from "./sheetSingleton"

// ── Constants ────────────────────────────────────────────────
export {
  READ_TIMEOUT_MS,
  SUPPORTED_PAIRS,
  SUPPORTED_TOKENS,
  EXECUTABLE_TOKENS,
  TOKEN_TO_PAIR,
} from "./constants"

// ── Price cache ──────────────────────────────────────────────
export { getCachedPrice, setCachedPrice } from "./priceCache"

// ── Event deduplication ──────────────────────────────────────
export { isDuplicateEvent } from "./eventDedup"

// ── Pre-trade snapshots ──────────────────────────────────────
export {
  storePreTradeSnapshot,
  getPreTradeSnapshotsSize,
  getAllPreTradeSnapshots,
} from "./preTradeSnapshots"

// ── Plan leg registry & types ────────────────────────────────
export type { PlannedLegContext, ExecutionPayloadShape } from "./planLegRegistry"
export type { ExecuteApprovalPayload } from "./planLegRegistry"
export {
  registerRebalancePlan,
  getRegisteredPlanLeg,
  consumeRegisteredPlanLeg,
} from "./planLegRegistry"

// ── Guardrails ───────────────────────────────────────────────
export {
  lastExecutionTime,
  dailyVolumeUsd,
  dailyVolumeResetDate,
  withExecutionLock,
  setLastExecutionTime,
  addDailyVolume,
  resetDailyVolume,
  resetDailyVolumeIfNeeded,
  enforceRiskRules,
  estimateTradeUsdValue,
  persistGuardrailState,
} from "./guardrails"

// ── Trade memo builders ──────────────────────────────────────
export {
  buildPolicyChecks,
  computeCurrentDrift,
  buildExecutionPayloadHash,
} from "./tradeMemoBuilders"

// ── Sheet watcher & lifecycle ────────────────────────────────
export {
  initSheetSetup,
  startSheetWatcher,
  stopAllTimers,
  isJudgeMode,
} from "./sheetWatcher"
