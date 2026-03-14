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
import { buildSwapAction, logRegistryAction } from "./registry"
import { getErrorMessage } from "../utils/errors"
import { createLogger } from "../utils/logger"
import { POLKADOT_HUB_TESTNET } from "../config/polkadot-hub"
import { fetchPortfolio, formatPortfolioForChat } from "./portfolio"
import { getPrice, getPrices } from "./price"
import { getNativeBalance, getTokenBalances, formatTokenBalance } from "./blockchain"

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
      "  /balance <token>      Check token balance (DOT, USDT, WETH)",
      "  /price <pair>         Check price (DOT_USD, WETH_USD)",
      "  /portfolio            View full portfolio with real on-chain data",
      "  /risk                 Show current risk rules",
      "  /status               Show agent status",
      "",
      "Polkadot Hub",
      "  /polkadot             Polkadot ecosystem info",
      "  /hub-status           Polkadot Hub network info",
      "  /dot-price            DOT/USD price query",
      "  /xcm                  XCM cross-chain status",
      "",
      "Stablecoin",
      "  /reserve              Stablecoin reserve status",
      "",
      "Trading",
      "  /trade <command>      Natural-language trade staging",
      "",
      "Natural language is handled by Gemini. Swap intents are staged in Pending Trades for approval.",
    ].join("\n")
  }

  if (trimmed === "/gas") {
    try {
      const prices = await getPrices()
      return `Gas on ${POLKADOT_HUB_TESTNET.name}: Paid in ${POLKADOT_HUB_TESTNET.nativeCurrency.symbol} (~$${prices.DOT_USD?.toFixed(2) ?? "N/A"}/DOT). Polkadot Hub has low fees.`
    } catch {
      return "Failed to fetch gas info. Try again later."
    }
  }

  if (trimmed === "/portfolio") {
    const wallet = process.env.WALLET_ADDRESS
    if (!wallet) return "WALLET_ADDRESS not configured. Set it in .env to view portfolio."
    try {
      const portfolio = await fetchPortfolio(wallet)
      return formatPortfolioForChat(portfolio)
    } catch (err) {
      return `Failed to fetch portfolio: ${getErrorMessage(err).slice(0, 100)}`
    }
  }

  if (trimmed.startsWith("/balance")) {
    const wallet = process.env.WALLET_ADDRESS
    if (!wallet) return "WALLET_ADDRESS not configured. Set it in .env to check balances."
    const parts = trimmed.split(/\s+/)
    const token = (parts[1] || "DOT").toUpperCase()
    try {
      if (token === "DOT" || token === "PAS") {
        const raw = await getNativeBalance(wallet)
        const formatted = formatTokenBalance(raw, 10)
        return `${token} Balance: ${formatted} ${POLKADOT_HUB_TESTNET.nativeCurrency.symbol}\n  Wallet: ${wallet}`
      } else {
        const balances = await getTokenBalances(wallet)
        const raw = balances[token as keyof typeof balances] || "0"
        const decimals = token === "USDT" ? 6 : 18
        const formatted = formatTokenBalance(raw, decimals)
        return `${token} Balance: ${formatted}\n  Wallet: ${wallet}`
      }
    } catch (err) {
      return `Failed to fetch ${token} balance: ${getErrorMessage(err).slice(0, 100)}`
    }
  }

  if (trimmed.startsWith("/price")) {
    const parts = trimmed.split(/\s+/)
    const pair = (parts[1] || "DOT_USD").toUpperCase()
    try {
      const price = await getPrice(pair)
      return price > 0
        ? `${pair}: $${price.toFixed(2)}`
        : `${pair}: Price not available (check pair name — supported: DOT_USD, WETH_USD, USDT_USD)`
    } catch (err) {
      return `Failed to fetch price: ${getErrorMessage(err).slice(0, 100)}`
    }
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
      `  Wallet: ${process.env.WALLET_ADDRESS || "Not configured"}`,
      "  Mode: Real on-chain data",
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

  if (trimmed === "/reserve" || trimmed === "/stablecoin" || trimmed === "/stable") {
    const rules = await readRiskRules(process.env.GOOGLE_SHEET_ID || "")
    return [
      "Stablecoin Reserve Status:",
      `  Minimum Reserve Target: $${rules.minStableReserveUsd}`,
      `  Allowed Stablecoins: USDT (primary on Polkadot Hub)`,
      `  Target USDT Allocation: See Risk Rules tab`,
      "",
      "  Use 'How much stablecoin reserve do I have?' in chat for AI analysis.",
      "  Use 'Rebalance to 40% USDT' to trigger a stablecoin rebalance plan.",
    ].join("\n")
  }

  if (trimmed === "/xcm" || trimmed === "/cross-chain") {
    return [
      "XCM Cross-Chain Status:",
      "",
      `  Network: ${POLKADOT_HUB_TESTNET.name}`,
      "  XCM Precompile: 0xA0000 (Polkadot Hub)",
      "  Bridge Contract: SheetFraXcmBridge.sol",
      "",
      "  Capabilities:",
      "  - weighMessage(): Estimate cross-chain message cost",
      "  - execute(): Execute XCM messages locally",
      "  - Cross-chain asset visibility via XCM queries",
      "",
      "  Connected Parachains: Hydration, Bifrost, Snowbridge (Ethereum)",
    ].join("\n")
  }

  return null
}

async function buildGeminiContextForChat(sheetId: string): Promise<GeminiContext> {
  const context: GeminiContext = {
    walletAddress: process.env.WALLET_ADDRESS || undefined,
    network: POLKADOT_HUB_TESTNET.name,
  }

  // Fetch real portfolio data for Gemini context
  const wallet = process.env.WALLET_ADDRESS
  if (wallet) {
    try {
      const portfolio = await fetchPortfolio(wallet)
      context.portfolio = {
        totalValueUsd: portfolio.totalValueUsd,
        tokens: portfolio.tokens.map(t => ({
          symbol: t.symbol,
          balance: parseFloat(t.balance) || 0,
          valueUsd: t.valueUsd,
        })),
      }
    } catch {
      // Non-critical — Gemini will work without portfolio context
    }
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

    // Log to SheetFraRegistry audit trail
    const registryAction = buildSwapAction(sheetId, tokenIn, tokenOut, intent.amount, process.env.WALLET_ADDRESS)
    logRegistryAction(sheetId, registryAction).catch(() => {})

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
    parts.push("\n\nStaged as a Pending Trade. Approve it from the Pending Trades tab to execute. Action logged to SheetFraRegistry audit trail.")
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