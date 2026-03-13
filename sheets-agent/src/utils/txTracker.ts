/**
 * Transaction lifecycle tracker.
 *
 * Records every step of a trade's journey from sheet command through
 * signing and on-chain confirmation. Prints a full timeline banner
 * at the end so you can see the complete lifecycle in one view.
 *
 * Steps (in order):
 *   SHEET_COMMAND        — user typed a command in Google Sheets
 *   WEBHOOK_RECEIVED     — webhook received
 *   TX_SENT              — transaction broadcast to chain
 *   TX_CONFIRMED         — transaction confirmed on-chain
 */

// ── ANSI color codes ─────────────────────────────────────────────────────────
const R  = "\x1b[0m"
const B  = "\x1b[1m"
const DIM = "\x1b[2m"
const CYAN    = "\x1b[36m"
const GREEN   = "\x1b[32m"
const YELLOW  = "\x1b[33m"
const MAGENTA = "\x1b[35m"
const BLUE    = "\x1b[34m"
const RED     = "\x1b[31m"
const WHITE   = "\x1b[37m"

export type TxStep =
  | "SHEET_COMMAND"
  | "WEBHOOK_RECEIVED"
  | "TX_SENT"
  | "TX_CONFIRMED"

interface StepEntry {
  step: TxStep
  ts: number
  detail?: string
}

interface TrackedTx {
  requestId: string
  description: string
  steps: StepEntry[]
  createdAt: number
  txHash?: string
  success?: boolean
}

const STEP_ICON: Record<TxStep, string> = {
  SHEET_COMMAND:       "💬",
  WEBHOOK_RECEIVED:    "📡",
  TX_SENT:             "🔄",
  TX_CONFIRMED:        "🟢",
}

const STEP_COLOR: Record<TxStep, string> = {
  SHEET_COMMAND:       MAGENTA,
  WEBHOOK_RECEIVED:    BLUE,
  TX_SENT:             YELLOW,
  TX_CONFIRMED:        GREEN,
}

const TTL_MS = 10 * 60 * 1000  // 10 minutes

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false })
}

function fmtElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function line(w = 72): string {
  return "─".repeat(w)
}

// ── Singleton store ──────────────────────────────────────────────────────────

const store = new Map<string, TrackedTx>()

function cleanup(): void {
  const now = Date.now()
  for (const [id, tx] of store.entries()) {
    if (now - tx.createdAt > TTL_MS) store.delete(id)
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start tracking a new transaction lifecycle.
 * Call this when the agent receives a request from Google Sheets.
 */
export function txStart(requestId: string, description: string): void {
  cleanup()
  store.set(requestId, {
    requestId,
    description,
    steps: [],
    createdAt: Date.now(),
  })
}

/**
 * Record a step in the transaction lifecycle.
 */
export function txStep(requestId: string, step: TxStep, detail?: string): void {
  const tx = store.get(requestId)
  if (!tx) return
  tx.steps.push({ step, ts: Date.now(), detail })
}

/**
 * Mark the transaction as complete and print the full lifecycle timeline.
 * @param requestId  the request ID used throughout the lifecycle
 * @param txHash     the final on-chain transaction hash (if any)
 * @param success    whether the trade succeeded
 */
export function txComplete(requestId: string, txHash?: string, success = true): void {
  const tx = store.get(requestId)
  if (!tx) {
    printOrphanComplete(requestId, txHash, success)
    return
  }
  tx.txHash = txHash
  tx.success = success
  printLifecycle(tx)
  store.delete(requestId)
}

/**
 * Mark the transaction as failed and print the lifecycle.
 */
export function txFail(requestId: string, reason?: string): void {
  const tx = store.get(requestId)
  if (!tx) return
  tx.success = false
  if (reason) {
    tx.steps.push({ step: "TX_CONFIRMED", ts: Date.now(), detail: `FAILED: ${reason}` })
  }
  printLifecycle(tx)
  store.delete(requestId)
}

// ── Lifecycle banner printer ─────────────────────────────────────────────────

function printLifecycle(tx: TrackedTx): void {
  const W = 72
  const success = tx.success !== false
  const color = success ? GREEN : RED
  const icon = success ? "✅" : "❌"
  const label = success ? "COMPLETE" : "FAILED"

  const title = `  ${icon}  TRANSACTION LIFECYCLE  ─  ${tx.description.slice(0, 30)}`
  const timeStr = `[${fmtTime(tx.createdAt)}]  `
  const pad = W - title.length - timeStr.length - 2
  const header = `${title}${" ".repeat(Math.max(0, pad))}${timeStr}`

  console.log(`\n${color}${B}╔${"═".repeat(W)}╗${R}`)
  console.log(`${color}${B}║${R}${color}${B}${header}${R}${color}${B}║${R}`)
  console.log(`${color}${B}╠${"═".repeat(W)}╣${R}`)

  // Print each step as a timeline row
  let prevTs = tx.createdAt
  for (const entry of tx.steps) {
    const elapsed = fmtElapsed(entry.ts - prevTs)
    const stepColor = STEP_COLOR[entry.step]
    const stepIcon = STEP_ICON[entry.step]
    const stepLabel = entry.step.padEnd(22)
    const timeLabel = fmtTime(entry.ts)
    const elapsedLabel = `+${elapsed}`.padStart(8)
    const detailStr = entry.detail
      ? ` ${DIM}${entry.detail.slice(0, W - 50)}${R}`
      : ""

    console.log(
      `${color}${B}║${R}  ${stepColor}${B}${stepIcon} ${stepLabel}${R}` +
      `  ${DIM}${timeLabel}${R}` +
      `  ${WHITE}${elapsedLabel}${R}` +
      `${detailStr}`
    )
    prevTs = entry.ts
  }

  // Total elapsed
  const lastTs = tx.steps.length > 0 ? tx.steps[tx.steps.length - 1].ts : tx.createdAt
  const totalElapsed = fmtElapsed(lastTs - tx.createdAt)

  console.log(`${color}${B}╠${"═".repeat(W)}╣${R}`)
  console.log(`${color}${B}║${R}  ${B}Status   :${R} ${color}${label}${R}  ${DIM}(total: ${totalElapsed})${R}`)

  if (tx.txHash) {
    const explorerUrl = `https://polkadot-hub-testnet.blockscout.com/tx/${tx.txHash}`
    console.log(`${color}${B}║${R}  ${B}Tx Hash  :${R} ${GREEN}${tx.txHash}${R}`)
    console.log(`${color}${B}║${R}  ${B}Explorer :${R} ${BLUE}${explorerUrl}${R}`)
  }

  console.log(`${color}${B}╚${"═".repeat(W)}╝${R}\n`)
}

function printOrphanComplete(requestId: string, txHash?: string, success = true): void {
  const W = 72
  const color = success ? GREEN : RED
  const icon = success ? "✅" : "❌"
  console.log(`\n${color}${B}╔${"═".repeat(W)}╗${R}`)
  console.log(`${color}${B}║${R}  ${icon}  TRANSACTION ${success ? "COMPLETE" : "FAILED"}  (${requestId.slice(0, 20)})`)
  if (txHash) {
    console.log(`${color}${B}║${R}  ${B}Tx Hash:${R} ${txHash}`)
  }
  console.log(`${color}${B}╚${"═".repeat(W)}╝${R}\n`)
}

// ── Convenience: get current step count (for diagnostics) ───────────────────
export function txStepCount(requestId: string): number {
  return store.get(requestId)?.steps.length ?? 0
}

export function activeTxCount(): number {
  return store.size
}
