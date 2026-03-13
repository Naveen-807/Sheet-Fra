/**
 * Chat processing service.
 *
 * Priority order:
 *   1. Slash commands handled locally
 *   2. Direct Gemini API for natural-language responses
 *
 * When Gemini detects a swap intent, it is staged in Pending Trades for
 * explicit sheet approval rather than auto-executed.
 */

import {
  readChatHistory,
  appendAgentLog,
  readRiskRules,
  stagePendingTrade,
} from "./sheets"
import {
  chatWithGemini,
  isGeminiAvailable,
  type ChatMessage,
  type GeminiContext,
} from "./gemini"
import { getErrorMessage } from "../utils/errors"
import { createLogger } from "../utils/logger"
import { POLKADOT_HUB_TESTNET } from "../config/polkadot-hub"

const log = createLogger("chat")

const CHAT_CONTEXT_LIMIT = 50

export interface ChatResponse {
  response: string
  role: "Agent"
  timestamp: string
  source: "slash-command" | "gemini-direct" | "error"
  tradeIntent?: {
    action: string
    tokenIn?: string
    tokenOut?: string
    amount?: number
    confidence?: string
  }
}

async function handleSlashCommand(message: string): Promise<string | null> {
  const trimmed = message.trim().toLowerCase()

  if (trimmed === "/help" || trimmed === "/commands") {
    return [
      "SheetFra AI — Available Commands:",
      "",
      "Portfolio & Market",
      "  /balance <token>      Not available in sheets-only mode",
      "  /price <pair>         Not available in sheets-only mode",
      "  /gas                  Not available in sheets-only mode",
      "  /portfolio            Not available in sheets-only mode",
      "  /risk                 Show current risk rules",
      "  /status               Show agent status",
      "",
      "Polkadot Hub",
      "  /polkadot             Polkadot ecosystem info",
      "  /hub-status           Polkadot Hub network info",
      "  /dot-price            DOT/USD price query",
      "",
      "Trading",
      "  /trade <command>      Natural-language trade staging",
      "",
      "Natural language is handled by Gemini. Swap intents are staged in Pending Trades for approval.",
    ].join("\n")
  }

  if (trimmed === "/gas") {
    return "Gas lookup is disabled in sheets-only mode."
  }

  if (trimmed === "/portfolio") {
    return "Portfolio lookup is disabled in sheets-only mode."
  }

  if (trimmed.startsWith("/balance ")) {
    return "Balance lookup is disabled in sheets-only mode."
  }

  if (trimmed.startsWith("/price ")) {
    return "Price lookup is disabled in sheets-only mode."
  }

  if (trimmed.startsWith("/trade ")) {
    return null
  }

  if (trimmed === "/risk") {
    const rules = await readRiskRules(process.env.GOOGLE_SHEET_ID || "")
    return [
      "Current Risk Rules:",
      `  Max Slippage: ${rules.maxSlippageBps} bps`,
      `  Allowed Assets: ${rules.allowedAssets.join(", ")}`,
      `  Cooldown: ${rules.cooldownMinutes} min`,
      `  Max Daily Volume: $${rules.maxDailyVolumeUsd.toLocaleString()}`,
      `  Max Single Asset: ${rules.maxSingleAssetPct}%`,
      `  Min Stable Reserve: $${rules.minStableReserveUsd}`,
    ].join("\n")
  }

  if (trimmed === "/status") {
    const geminiStatus = isGeminiAvailable() ? "Configured" : "Not configured"
    return [
      "SheetFra Agent Status:",
      "  Server: Running",
      `  Gemini AI: ${geminiStatus}`,
      `  Network: ${POLKADOT_HUB_TESTNET.name}`,
      `  Chain ID: ${POLKADOT_HUB_TESTNET.chainId}`,
      "  Mode: Sheets-only",
    ].join("\n")
  }

  if (trimmed === "/polkadot") {
    return [
      "Polkadot Ecosystem Overview:",
      "",
      "  Polkadot Hub — Unified chain with EVM compatibility, DOT staking & governance",
      "  Hydration — Primary DEX with Omnipool (single-sided liquidity, MEV-resistant)",
      "  Bifrost — Liquid staking (vDOT ~12-15% APY)",
      "  Snowbridge — Ethereum↔Polkadot bridge for WETH and other assets",
      "",
      "  Supported tokens: DOT, USDT, WETH",
      "  Wallets: Talisman, SubWallet (EVM-compatible)",
      `  Explorer: ${POLKADOT_HUB_TESTNET.blockExplorer}`,
      "  Faucet: https://faucet.polkadot.io/",
    ].join("\n")
  }

  if (trimmed === "/hub-status") {
    return [
      "Polkadot Hub Testnet Info:",
      `  Name: ${POLKADOT_HUB_TESTNET.name}`,
      `  Chain ID: ${POLKADOT_HUB_TESTNET.chainId}`,
      `  RPC: ${POLKADOT_HUB_TESTNET.rpcUrl}`,
      `  Explorer: ${POLKADOT_HUB_TESTNET.blockExplorer}`,
      `  Native Currency: ${POLKADOT_HUB_TESTNET.nativeCurrency.symbol} (${POLKADOT_HUB_TESTNET.nativeCurrency.decimals} decimals)`,
    ].join("\n")
  }

  if (trimmed === "/dot-price") {
    return null  // fall through to Gemini with DOT price query
  }

  return null
}

async function buildGeminiContextForChat(sheetId: string): Promise<GeminiContext> {
  const context: GeminiContext = {
    walletAddress: process.env.WALLET_ADDRESS || undefined,
    network: POLKADOT_HUB_TESTNET.name,
  }

  try {
    const rules = await readRiskRules(sheetId || process.env.GOOGLE_SHEET_ID || "")
    context.riskRules = {
      maxSlippageBps: rules.maxSlippageBps,
      allowedAssets: rules.allowedAssets,
      maxDailyVolumeUsd: rules.maxDailyVolumeUsd,
      cooldownMinutes: rules.cooldownMinutes,
      maxSingleAssetPct: rules.maxSingleAssetPct,
      minStableReserveUsd: rules.minStableReserveUsd,
    }
  } catch {
    // Non-critical.
  }

  return context
}

async function getChatHistory(sheetId: string): Promise<ChatMessage[]> {
  try {
    const history = await readChatHistory(sheetId, CHAT_CONTEXT_LIMIT)
    return history.map((entry) => ({
      role: entry.role === "You" ? "user" : "model",
      content: entry.message,
    }))
  } catch {
    return []
  }
}

async function maybeStageTradeIntent(
  intent: {
    action: string
    tokenIn?: string
    tokenOut?: string
    amount?: number
    isTradeIntent: boolean
  },
  sheetId: string,
): Promise<boolean> {
  if (!intent.isTradeIntent || intent.action !== "swap" || !intent.tokenIn || !intent.tokenOut || !intent.amount || intent.amount <= 0) {
    return false
  }

  const tokenIn = intent.tokenIn.toUpperCase() === "PAS" ? "DOT" : intent.tokenIn.toUpperCase()
  const tokenOut = intent.tokenOut.toUpperCase() === "PAS" ? "DOT" : intent.tokenOut.toUpperCase()

  try {
    await stagePendingTrade(sheetId, {
      tokenIn,
      tokenOut,
      amount: intent.amount,
      reason: `swap ${intent.amount} ${tokenIn} for ${tokenOut}`,
    })
    return true
  } catch (error) {
    log.warn("Failed to stage pending trade from AI intent", { error: getErrorMessage(error) })
    return false
  }
}

function formatTradeIntentResponse(intent: {
  action: string
  tokenIn?: string
  tokenOut?: string
  amount?: number
  protocol?: string
  response: string
  isTradeIntent: boolean
}): string {
  if (!intent.isTradeIntent) return intent.response

  const parts = [intent.response]
  if (intent.action === "swap" && intent.tokenIn && intent.tokenOut && intent.amount) {
    parts.push("\n\nStaged as a Pending Trade. Approve it from the Pending Trades tab to execute.")
  }
  return parts.join("")
}

export async function processChatMessage(
  message: string,
  sheetId: string,
  _executionContext?: { requestId?: string },
): Promise<ChatResponse> {
  const timestamp = new Date().toISOString()

  try {
    const slashResponse = await handleSlashCommand(message)
    if (slashResponse) {
      appendAgentLog(sheetId, "chat_command", `Command: \"${message.slice(0, 80)}\"`, undefined).catch(() => {})
      return { response: slashResponse, role: "Agent", timestamp, source: "slash-command" }
    }
  } catch (error) {
    log.warn("Slash command failed, continuing to AI", { error: getErrorMessage(error) })
  }

  if (!isGeminiAvailable()) {
    return {
      response: "AI service is not configured. Add GEMINI_API_KEY to .env to enable natural-language chat. Use slash commands (/help) for built-in operations.",
      role: "Agent",
      timestamp,
      source: "error",
    }
  }

  try {
    const history = await getChatHistory(sheetId)
    const context = await buildGeminiContextForChat(sheetId)
    const recentHistory = history.slice(-6)
    const intent = await chatWithGemini(message, context, recentHistory)

    await maybeStageTradeIntent(intent, sheetId)
    const responseText = formatTradeIntentResponse(intent)
    appendAgentLog(sheetId, "chat_response", `Gemini direct: \"${message.slice(0, 80)}\"`, undefined).catch(() => {})

    return {
      response: responseText,
      role: "Agent",
      timestamp,
      source: "gemini-direct",
      ...(intent.isTradeIntent && {
        tradeIntent: {
          action: intent.action,
          tokenIn: intent.tokenIn,
          tokenOut: intent.tokenOut,
          amount: intent.amount,
          confidence: intent.confidence,
        },
      }),
    }
  } catch (error) {
    log.error("Direct Gemini chat failed", { error: getErrorMessage(error) })
    return {
      response: `I'm having trouble connecting to the AI service. Try a slash command instead (/help). Error: ${getErrorMessage(error).slice(0, 100)}`,
      role: "Agent",
      timestamp,
      source: "error",
    }
  }
}