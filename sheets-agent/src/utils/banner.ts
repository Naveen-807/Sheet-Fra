/**
 * Rich terminal banner utilities for SheetFra agent.
 * Prints human-readable, color-coded banners for key events so you can
 * follow every step in the terminal as the system runs.
 */

import { POLKADOT_HUB_TESTNET } from "../config/polkadot-hub"

// ── ANSI color codes ────────────────────────────────────────────────────────
const R = "\x1b[0m"   // reset
const B = "\x1b[1m"   // bold
const DIM = "\x1b[2m" // dim

const CYAN    = "\x1b[36m"
const GREEN   = "\x1b[32m"
const YELLOW  = "\x1b[33m"
const MAGENTA = "\x1b[35m"
const BLUE    = "\x1b[34m"
const RED     = "\x1b[31m"
const WHITE   = "\x1b[37m"

// ── Helpers ─────────────────────────────────────────────────────────────────

function line(width = 70): string {
  return "─".repeat(width)
}

function ts(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false })
}

function explorerTxUrl(txHash: string): string {
  return `${POLKADOT_HUB_TESTNET.blockExplorer}/tx/${txHash}`
}

// ── Transaction hash banner ──────────────────────────────────────────────────
export function printTxSentBanner(description: string, txHash: string): void {
  const W = 72
  console.log(`\n${YELLOW}${B}┌${line(W)}┐${R}`)
  console.log(`${YELLOW}${B}│${R}  ${YELLOW}${B}🔄  TX SENT  ─  ${description}${R}`)
  console.log(`${YELLOW}${B}├${line(W)}┤${R}`)
  console.log(`${YELLOW}${B}│${R}  ${B}Hash    :${R} ${txHash}`)
  console.log(`${YELLOW}${B}│${R}  ${DIM}Waiting for confirmation...${R}`)
  console.log(`${YELLOW}${B}└${line(W)}┘${R}\n`)
}

export function printTxConfirmedBanner(
  description: string,
  txHash: string,
  blockNumber: number | bigint,
): void {
  const W = 72
  console.log(`\n${GREEN}${B}╔${line(W)}╗${R}`)
  console.log(`${GREEN}${B}║${R}  ${GREEN}${B}✅  TX CONFIRMED  ─  ${description}${R}`)
  console.log(`${GREEN}${B}╠${line(W)}╣${R}`)
  console.log(`${GREEN}${B}║${R}  ${B}Hash    :${R} ${GREEN}${txHash}${R}`)
  console.log(`${GREEN}${B}║${R}  ${B}Block   :${R} ${blockNumber}`)
  console.log(`${GREEN}${B}║${R}  ${B}Explorer:${R} ${BLUE}${explorerTxUrl(txHash)}${R}`)
  console.log(`${GREEN}${B}║${R}  ${DIM}Time    : ${ts()}${R}`)
  console.log(`${GREEN}${B}╚${line(W)}╝${R}\n`)
}

// ── Sheet command banner ─────────────────────────────────────────────────────
export function printSheetCommandBanner(source: string, message: string): void {
  const W = 72
  const title = `  💬  SHEET COMMAND  ─  ${source}`
  const time = `[${ts()}]  `
  const pad = W - title.length - time.length - 2
  const header = `${title}${" ".repeat(Math.max(0, pad))}${time}`
  const truncated = message.length > W - 10 ? message.slice(0, W - 13) + "..." : message

  console.log(`\n${MAGENTA}${B}┌${line(W)}┐${R}`)
  console.log(`${MAGENTA}${B}│${R}${MAGENTA}${B}${header}${R}${MAGENTA}${B}│${R}`)
  console.log(`${MAGENTA}${B}├${line(W)}┤${R}`)
  console.log(`${MAGENTA}${B}│${R}  ${B}User:${R} "${truncated}"`)
  console.log(`${MAGENTA}${B}└${line(W)}┘${R}\n`)
}

// ── Agent reply banner ───────────────────────────────────────────────────────
export function printAgentReplyBanner(reply: string, source: string): void {
  const W = 72
  const truncated = reply.length > W - 12 ? reply.slice(0, W - 15) + "..." : reply

  console.log(`${BLUE}${B}  🤖  Agent [${source}]:${R} ${truncated}\n`)
}

// ── Trade execution step banner ──────────────────────────────────────────────
export function printTradeStep(step: number, total: number, label: string, detail?: string): void {
  const W = 72
  const badge = `[${step}/${total}]`
  const msg = `  ${badge} ${label}`
  const truncDetail = detail && detail.length > W - msg.length - 4
    ? detail.slice(0, W - msg.length - 7) + "..."
    : detail || ""
  console.log(`${WHITE}${B}${msg}${R}  ${DIM}${truncDetail}${R}`)
}

// ── Risk rule block banner ───────────────────────────────────────────────────
export function printRiskBlockBanner(reason: string): void {
  const W = 72
  console.log(`\n${RED}${B}┌${line(W)}┐${R}`)
  console.log(`${RED}${B}│${R}  ${RED}${B}🛑  TRADE BLOCKED BY RISK RULES${R}`)
  console.log(`${RED}${B}├${line(W)}┤${R}`)
  console.log(`${RED}${B}│${R}  ${reason}`)
  console.log(`${RED}${B}└${line(W)}┘${R}\n`)
}

// ── Webhook receipt banner ────────────────────────────────────────────────────
export function printWebhookBanner(
  endpoint: string,
  details: Record<string, string | number | boolean | undefined>,
): void {
  const W = 72
  const title = `  📡  WEBHOOK RECEIVED  ─  ${endpoint}`
  const time = `[${ts()}]  `
  const pad = W - title.length - time.length - 2
  const header = `${title}${" ".repeat(Math.max(0, pad))}${time}`

  console.log(`\n${BLUE}${B}┌${line(W)}┐${R}`)
  console.log(`${BLUE}${B}│${R}${BLUE}${B}${header}${R}${BLUE}${B}│${R}`)
  console.log(`${BLUE}${B}├${line(W)}┤${R}`)
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue
    const label = key.padEnd(12)
    const valStr = String(value)
    const truncated = valStr.length > W - 18 ? valStr.slice(0, W - 21) + "..." : valStr
    console.log(`${BLUE}${B}│${R}  ${B}${label}:${R} ${truncated}`)
  }
  console.log(`${BLUE}${B}└${line(W)}┘${R}\n`)
}

// ── Execution summary banner ─────────────────────────────────────────────
export function printExecutionSummaryBanner(
  description: string,
  txHashes: string[],
  success: boolean,
): void {
  const W = 72
  const icon = success ? "✅" : "❌"
  const label = success ? "SUCCESS" : "FAILED"
  const color = success ? GREEN : RED
  const title = `  📋  EXECUTION SUMMARY  ─  ${description}`
  const time = `[${ts()}]  `
  const pad = W - title.length - time.length - 2
  const header = `${title}${" ".repeat(Math.max(0, pad))}${time}`

  console.log(`\n${color}${B}┌${line(W)}┐${R}`)
  console.log(`${color}${B}│${R}${color}${B}${header}${R}${color}${B}│${R}`)
  console.log(`${color}${B}├${line(W)}┤${R}`)
  console.log(`${color}${B}│${R}  ${B}Status   :${R} ${icon} ${label}`)
  txHashes.forEach((hash, i) => {
    const txLabel = `TX ${i + 1}`.padEnd(8)
    console.log(`${color}${B}│${R}  ${B}${txLabel} :${R} ${hash}`)
    console.log(`${color}${B}│${R}           ${DIM}${explorerTxUrl(hash)}${R}`)
  })
  console.log(`${color}${B}└${line(W)}┘${R}\n`)
}

// ── Sheet command helper ─────────────────────────────────────────────────
export function maybePrintSheetCommand(req: { headers: Record<string, string | string[] | undefined> }): void {
  const formula = req.headers["x-sheet-formula"] as string | undefined
  const command = req.headers["x-sheet-command"] as string | undefined
  const source = formula ? "Sheet formula" : command ? "Sheet command" : null
  if (source && (formula || command)) {
    printSheetCommandBanner(source, (formula || command)!)
  }
}

// ── Transaction lifecycle banner ─────────────────────────────────────────────
export function printTransactionLifecycleBanner(
  description: string,
  steps: Array<{ label: string; time: string; detail?: string }>,
  txHash?: string,
  success = true,
): void {
  const W = 72
  const color = success ? GREEN : RED
  const icon = success ? "✅" : "❌"
  const label = success ? "COMPLETE" : "FAILED"
  const time = `[${ts()}]  `
  const title = `  ${icon}  LIFECYCLE  ─  ${description.slice(0, 35)}`
  const pad = W - title.length - time.length - 2
  const header = `${title}${" ".repeat(Math.max(0, pad))}${time}`

  console.log(`\n${color}${B}╔${"═".repeat(W)}╗${R}`)
  console.log(`${color}${B}║${R}${color}${B}${header}${R}${color}${B}║${R}`)
  console.log(`${color}${B}╠${"═".repeat(W)}╣${R}`)

  for (const step of steps) {
    const detailStr = step.detail
      ? `  ${DIM}${step.detail.slice(0, W - 40)}${R}`
      : ""
    const labelPad = step.label.padEnd(24)
    console.log(`${color}${B}║${R}  ${B}${labelPad}${R}  ${DIM}${step.time}${R}${detailStr}`)
  }

  console.log(`${color}${B}╠${"═".repeat(W)}╣${R}`)
  console.log(`${color}${B}║${R}  ${B}Status   :${R} ${color}${label}${R}`)
  if (txHash) {
    console.log(`${color}${B}║${R}  ${B}Tx Hash  :${R} ${GREEN}${txHash}${R}`)
    console.log(`${color}${B}║${R}  ${B}Explorer :${R} ${BLUE}${explorerTxUrl(txHash)}${R}`)
  }
  console.log(`${color}${B}╚${"═".repeat(W)}╝${R}\n`)
}

// ── Startup banner ───────────────────────────────────────────────────────────
export function printStartupBanner(port: number | string): void {
  const W = 72
  console.log(`\n${CYAN}${B}╔${"═".repeat(W)}╗${R}`)
  console.log(`${CYAN}${B}║${R}${CYAN}${B}  🚀  SheetFra Agent  ─  DeFi Treasury on Polkadot Hub${" ".repeat(W - 54)}║${R}`)
  console.log(`${CYAN}${B}╠${"═".repeat(W)}╣${R}`)
  console.log(`${CYAN}${B}║${R}  ${B}Port      :${R} ${port}`)
  console.log(`${CYAN}${B}║${R}  ${B}Network   :${R} ${POLKADOT_HUB_TESTNET.name}`)
  console.log(`${CYAN}${B}║${R}  ${B}Chain ID  :${R} ${POLKADOT_HUB_TESTNET.chainId}`)
  console.log(`${CYAN}${B}║${R}  ${B}Mode      :${R} ${process.env.JUDGE_MODE === "true" ? RED + "JUDGE (production)" + R : GREEN + "DEVELOPMENT" + R}`)
  console.log(`${CYAN}${B}║${R}  ${DIM}Started   : ${new Date().toISOString()}${R}`)
  console.log(`${CYAN}${B}╚${"═".repeat(W)}╝${R}\n`)
}
