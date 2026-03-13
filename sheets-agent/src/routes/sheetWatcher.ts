/**
 * Sheet watcher — auto-setup, sheet polling, interactive polling, and graceful shutdown.
 */

import fs from "fs"
import path from "path"
import { getErrorMessage } from "../utils/errors"
import { createLogger } from "../utils/logger"
import { printSheetCommandBanner, printAgentReplyBanner } from "../utils/banner"
import { processChatMessage } from "../services/chat"
import crypto from "crypto"
import { startExecutionRecord, completeExecutionRecord, failExecutionRecord, updateExecutionRecord } from "../services/executionLedger"
import {
  autoConfigureSheetId,
  setupSheetTemplate,
  discoverAllSheetIds,
  clearChatInput,
  appendChatMessage,
  appendAgentLog,
  getSheetsClient,
} from "../services/sheets"
import { getSpreadsheetId, setSpreadsheetId } from "./sheetSingleton"
import { restoreGuardrailState } from "./guardrails"

const log = createLogger("shared")

// ── Auto-setup: discover sheet + create template tabs on startup ──
export async function initSheetSetup(): Promise<void> {
  try {
    const id = await autoConfigureSheetId()
    setSpreadsheetId(id)
    managedSheets.add(id)

    const created = await setupSheetTemplate(id)
    if (created.length > 0) {
      log.info("Created sheet tabs", { tabs: created })
    } else {
      log.info("All sheet tabs already exist")
    }

    await restoreGuardrailState()
  } catch (err: unknown) {
    log.error("Sheet auto-setup failed", { error: getErrorMessage(err) })
    log.error("Share a Google Sheet with your service account and restart.")
  }
}

// ── Sheet watcher: detects newly shared sheets and template changes ──
const WATCHER_INTERVAL_MS = 30_000
const managedSheets = new Set<string>()

// ── Timer references for graceful shutdown ───────────────────
let watcherTimerId: ReturnType<typeof setInterval> | null = null

// ── Interactive sheet polling ────────────────────────────────
const INTERACTIVE_POLL_INTERVAL_MS = 10_000
const IDLE_POLL_INTERVAL_MS = 20_000
let lastChatMessage = ""
let consecutiveIdlePolls = 0
let interactivePollTimerId: ReturnType<typeof setTimeout> | null = null

/**
 * Polls Google Drive every 30s for spreadsheets shared with the service account.
 * - New sheet detected -> runs setupSheetTemplate() to build all tabs
 * - Existing sheet -> re-runs setupSheetTemplate() to apply any template updates
 * - Switches the active SPREADSHEET_ID when a brand-new sheet is found
 */
export function startSheetWatcher(): void {
  const currentId = getSpreadsheetId()
  if (currentId) managedSheets.add(currentId)

  const tick = async () => {
    try {
      const allSheets = await discoverAllSheetIds()

      for (const sheet of allSheets) {
        const isNew = !managedSheets.has(sheet.id)

        if (isNew) {
          log.info("New sheet detected — setting up template", { name: sheet.name, id: sheet.id })

          // Create all tabs and apply formatting
          const created = await setupSheetTemplate(sheet.id)
          managedSheets.add(sheet.id)

          log.info("Template applied to new sheet", {
            name: sheet.name,
            created: created.length > 0 ? created.join(", ") : "formatting refreshed",
          })

          // Switch the active sheet to the newly shared one
          setSpreadsheetId(sheet.id)
          log.info("Active sheet switched", { name: sheet.name, id: sheet.id })

          // Persist the new sheet ID to .env so it survives restarts
          persistEnvValue("GOOGLE_SHEET_ID", sheet.id)
          process.env.GOOGLE_SHEET_ID = sheet.id
        } else {
          // Already managed — mark as seen but skip expensive template re-apply
          managedSheets.add(sheet.id)
        }
      }
    } catch (err: unknown) {
      log.warn("Polling tick failed", { error: getErrorMessage(err) })
    }
  }

  watcherTimerId = setInterval(tick, WATCHER_INTERVAL_MS)
  log.info("Sheet watcher started", { intervalSeconds: WATCHER_INTERVAL_MS / 1000 })

  // Start interactive tab polling
  startInteractivePolling()
}

/**
 * Writes or updates a single key=value line in the .env file.
 * Adds the line if the key doesn't exist yet.
 */
function persistEnvValue(key: string, value: string): void {
  try {
    const envPath = path.resolve(__dirname, "../../.env")
    if (!fs.existsSync(envPath)) return
    let content = fs.readFileSync(envPath, "utf-8")
    const regex = new RegExp(`^${key}=.*`, "m")
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`)
    } else {
      content += `\n${key}=${value}\n`
    }
    fs.writeFileSync(envPath, content)
    log.info(`Persisted ${key} to .env`)
  } catch (err) {
    log.warn(`Failed to persist ${key} to .env`, { error: getErrorMessage(err) })
  }
}

/**
 * Polls the active spreadsheet for user interactions.
 * Uses batchGet to consolidate 3 separate API calls into 1.
 * Adapts polling interval: 10s when active, stretches to 20s when idle.
 */
function startInteractivePolling(): void {
  let currentInterval = INTERACTIVE_POLL_INTERVAL_MS

  const schedulePoll = () => {
    interactivePollTimerId = setTimeout(async () => {
      const sid = getSpreadsheetId()
      if (!sid) {
        schedulePoll()
        return
      }

      let hadActivity = false

      try {
        // Single batchGet for all 3 tabs instead of 3 separate API calls
        const sheets = await getSheetsClient()
        const result = await sheets.spreadsheets.values.batchGet({
          spreadsheetId: sid,
          ranges: [
            "'Chat with Wallet'!B2",
            "'Chat with Wallet'!B3",
          ],
        })

        const ranges = result.data.valueRanges || []
        // Poll both B2 (new layout) and B3 (legacy Code.gs layout) — use first non-empty
        const chatB2 = (ranges[0]?.values?.[0]?.[0] as string | undefined)?.trim() || null
        const chatB3 = (ranges[1]?.values?.[0]?.[0] as string | undefined)?.trim() || null
        const chatData = chatB2 || chatB3

        // Process chat
        try {
          const message = chatData || null
          if (message && message !== lastChatMessage) {
            hadActivity = true
            lastChatMessage = message
            await handleChatMessage(sid, message)
          }
        } catch (e) { log.warn("Chat poll error", { error: getErrorMessage(e) }) }

      } catch (e) {
        log.warn("Batch poll read failed", { error: getErrorMessage(e) })
      }

      // Adaptive polling: stretch interval when idle
      if (hadActivity) {
        consecutiveIdlePolls = 0
        currentInterval = INTERACTIVE_POLL_INTERVAL_MS
      } else {
        consecutiveIdlePolls++
        if (consecutiveIdlePolls > 6) {
          currentInterval = IDLE_POLL_INTERVAL_MS
        }
      }

      schedulePoll()
    }, currentInterval + Math.random() * 2000 - 1000) // Add jitter +/- 1s
  }

  schedulePoll()
  log.info("Interactive polling started", { activeIntervalSeconds: INTERACTIVE_POLL_INTERVAL_MS / 1000, idleIntervalSeconds: IDLE_POLL_INTERVAL_MS / 1000 })
}


/** Handle a new chat message from the batch poll */
async function handleChatMessage(spreadsheetId: string, message: string): Promise<void> {
  log.info(`[SHEET] Chat: "${message.slice(0, 80)}"`)
  printSheetCommandBanner("Chat with Wallet tab", message)
  const requestId = crypto.randomUUID()

  await startExecutionRecord({
    spreadsheetId,
    requestId,
    source: "sheet-chat",
    command: message,
    parsedAction: "Chat command detected",
    workflow: "chat-router",
    status: "QUEUED",
    result: "Waiting for backend execution",
  })

  // Append user message and clear input (run in parallel for speed)
  await Promise.allSettled([
    appendChatMessage(spreadsheetId, "You", message),
    clearChatInput(spreadsheetId),
  ])

  try {
    await updateExecutionRecord({
      requestId,
      status: "RUNNING",
      parsedAction: "Processing chat command",
      workflow: "chat-router",
      result: "Dispatching to slash command or Gemini",
    })

    const result = await processChatMessage(message, spreadsheetId, { requestId })

    // Format response with source indicator
    const sourceLabel = result.source === "gemini-direct"
      ? " [Gemini AI]"
      : result.source === "slash-command"
      ? ""
      : ""

    await appendChatMessage(spreadsheetId, "Agent", result.response + sourceLabel)
    await completeExecutionRecord(requestId, {
      parsedAction: result.tradeIntent
        ? `${result.tradeIntent.action} ${result.tradeIntent.amount || ""} ${result.tradeIntent.tokenIn || ""} -> ${result.tradeIntent.tokenOut || ""}`.trim()
        : `Chat response via ${result.source}`,
      workflow: result.source,
      status: result.tradeIntent ? "PENDING_APPROVAL" : "COMPLETED",
      result: result.response,
    })
    printAgentReplyBanner(result.response, result.source)
    log.info(`[SHEET] Agent replied → Chat tab updated (source: ${result.source})`)

    // Log to Agent Logs tab
    appendAgentLog(
      spreadsheetId,
      "chat",
      `User: "${message.slice(0, 60)}" → ${result.source}`,
      undefined,
    ).catch(() => {})
  } catch (e) {
    const errMsg = getErrorMessage(e)
    log.warn("Chat response processing error", { error: errMsg })
    const fallbackMsg = errMsg.includes("GEMINI_API_KEY")
      ? "AI not configured. Use slash commands like /help, /risk, /status"
      : `Sorry, I encountered an error: ${errMsg.slice(0, 100)}. Try a slash command like /help.`
    await appendChatMessage(spreadsheetId, "Agent", fallbackMsg).catch(() => {})
    await failExecutionRecord(requestId, fallbackMsg, {
      parsedAction: "Chat command failed",
      workflow: "chat-router",
    })
  }
}

// ── Mode helpers ─────────────────────────────────────────────
export function isJudgeMode(): boolean {
  return process.env.JUDGE_MODE === "true" || process.env.NODE_ENV === "production"
}

// ── Graceful shutdown ────────────────────────────────────────
export function stopAllTimers(): void {
  if (watcherTimerId) { clearInterval(watcherTimerId); watcherTimerId = null }
  if (interactivePollTimerId) { clearTimeout(interactivePollTimerId); interactivePollTimerId = null }
  log.info("All timers stopped")
}
