/**
 * Direct Gemini 2.0 Flash API client for SheetFra.
 *
 * Used as the primary AI layer for natural-language DeFi operations on Polkadot Hub.
 *
 * Falls back gracefully when GEMINI_API_KEY is not set.
 */

import { createLogger } from "../utils/logger"
import { POLKADOT_HUB_TESTNET } from "../config/polkadot-hub"

const log = createLogger("gemini")

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ""
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"
const GEMINI_TIMEOUT_MS = 25_000

// ── Types ──────────────────────────────────────────────────────────────────

export type TradeAction =
  | "swap"
  | "stake"
  | "unstake"
  | "add_liquidity"
  | "remove_liquidity"
  | "portfolio"
  | "price"
  | "balance"
  | "defi"
  | "gas"
  | "rebalance"
  | "private_trade"
  | "risk"
  | "info"
  | "none"

export interface TradeIntent {
  action: TradeAction
  tokenIn?: string
  tokenOut?: string
  amount?: number
  protocol?: string
  positionId?: string
  response: string
  isTradeIntent: boolean
  summary?: string
  confidence?: "high" | "medium" | "low"
  suggestedSlippageBps?: number
}

export interface ChatMessage {
  role: "user" | "model"
  content: string
}

export interface GeminiContext {
  portfolio?: {
    tokens: Array<{ symbol: string; balance: number; valueUsd: number }>
    totalValueUsd: number
  }
  defiSummary?: {
    totalPortfolioUsd: number
    weightedAvgApy: number
    positions: { yieldFarming: number; staking: number; liquidity: number }
    totalDailyRewardsUsd: number
    totalUnclaimedRewardsUsd: number
  }
  riskRules?: {
    maxSlippageBps: number
    allowedAssets: string[]
    maxDailyVolumeUsd: number
    cooldownMinutes: number
    maxSingleAssetPct: number
    minStableReserveUsd: number
  }
  prices?: Record<string, number>
  walletAddress?: string
  network?: string
  agentStatus?: string
}

// ── Availability ───────────────────────────────────────────────────────────

export function isGeminiAvailable(): boolean {
  return Boolean(GEMINI_API_KEY)
}

// ── System prompt builder ──────────────────────────────────────────────────

function buildSystemPrompt(context: GeminiContext): string {
  const lines: string[] = [
    "You are SheetFra — an AI DeFi treasury assistant for Polkadot Hub, embedded directly in Google Sheets.",
    "You help users manage their portfolio, execute swaps, stake assets, and monitor DeFi positions on Polkadot Hub.",
    "",
    "CORE IDENTITY:",
    "- You turn spreadsheet cells into verifiable DeFi operations on Polkadot Hub",
    "- Every trade you suggest goes through a user approval flow before execution",
    "- Polkadot Hub is a unified chain with EVM compatibility, DOT staking, and governance",
    `- Explorer: ${POLKADOT_HUB_TESTNET.blockExplorer}`,
    "",
    "SUPPORTED TOKENS (Polkadot Hub Testnet):",
    "- DOT: Native asset (PAS on testnet, 10 decimals) — the core Polkadot token",
    "- USDT: Tether USD (ERC-20 on Polkadot Hub) — primary stablecoin",
    "- WETH: Wrapped Ether (bridged via Snowbridge from Ethereum)",
    "",
    "DEFI CAPABILITIES:",
    "- Execute swaps via Hydration Omnipool (single-sided liquidity, MEV-resistant)",
    "- Liquid staking via Bifrost (vDOT, ~12-15% APY)",
    "- Provide liquidity on Hydration Omnipool pools",
    "- DOT staking via Polkadot Hub native staking",
    "- Portfolio rebalancing with AI-planned legs",
    "",
    "ECOSYSTEM CONTEXT:",
    "- Polkadot Hub unifies DOT, staking, governance, and EVM in one chain",
    "- Snowbridge enables Ethereum↔Polkadot bridging for assets like WETH",
    "- Hydration is the primary DEX with Omnipool architecture (concentrated liquidity)",
    "- Bifrost provides liquid staking derivatives (vDOT) for staked DOT",
    "- Wallets: Talisman and SubWallet (EVM-compatible on Polkadot Hub)",
    `- Faucet for testnet PAS: https://faucet.polkadot.io/`,
    "",
  ]

  if (context.walletAddress) {
    lines.push(`CONNECTED WALLET: ${context.walletAddress}`)
    lines.push(`NETWORK: ${context.network || POLKADOT_HUB_TESTNET.name}`)
    lines.push("")
  }

  if (context.portfolio && context.portfolio.tokens.length > 0) {
    lines.push("CURRENT PORTFOLIO:")
    lines.push(`  Total Value: $${context.portfolio.totalValueUsd.toFixed(2)}`)
    for (const t of context.portfolio.tokens) {
      const bal = t.symbol === "USDT"
        ? t.balance.toFixed(2)
        : t.balance.toFixed(6)
      lines.push(`  ${t.symbol}: ${bal} ($${t.valueUsd.toFixed(2)})`)
    }
    lines.push("")
  }

  if (context.prices && Object.keys(context.prices).length > 0) {
    lines.push("LIVE PRICES:")
    for (const [pair, price] of Object.entries(context.prices)) {
      if (price > 0) {
        lines.push(`  ${pair}: $${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      }
    }
    lines.push("")
  }

  if (context.defiSummary) {
    const s = context.defiSummary
    lines.push("ACTIVE DEFI POSITIONS:")
    lines.push(`  Total DeFi Value: $${s.totalPortfolioUsd.toFixed(2)}`)
    lines.push(`  Weighted APY: ${s.weightedAvgApy.toFixed(2)}%`)
    lines.push(`  Yield Farming: ${s.positions.yieldFarming} positions`)
    lines.push(`  Staking: ${s.positions.staking} positions`)
    lines.push(`  Liquidity: ${s.positions.liquidity} positions`)
    lines.push(`  Daily Rewards: $${s.totalDailyRewardsUsd.toFixed(4)}`)
    lines.push(`  Unclaimed Rewards: $${s.totalUnclaimedRewardsUsd.toFixed(4)}`)
    lines.push("")
  }

  if (context.riskRules) {
    const r = context.riskRules
    lines.push("ACTIVE RISK RULES:")
    lines.push(`  Max Slippage: ${r.maxSlippageBps} bps (${(r.maxSlippageBps / 100).toFixed(2)}%)`)
    lines.push(`  Allowed Assets: ${r.allowedAssets.join(", ")}`)
    lines.push(`  Max Daily Volume: $${r.maxDailyVolumeUsd.toLocaleString()}`)
    lines.push(`  Trade Cooldown: ${r.cooldownMinutes} minutes`)
    lines.push(`  Max Single Asset: ${r.maxSingleAssetPct}%`)
    lines.push(`  Min Stable Reserve: $${r.minStableReserveUsd}`)
    lines.push("")
  }

  lines.push("RESPONSE REQUIREMENTS:")
  lines.push("1. Respond ONLY with a valid JSON object matching the required schema")
  lines.push("2. 'response' field: conversational, concise, actionable (1-3 sentences max)")
  lines.push("3. 'isTradeIntent': true ONLY if user explicitly wants to execute (words like 'swap', 'stake', 'buy', 'sell', 'trade', 'execute', 'do it')")
  lines.push("4. For trade intents: extract tokenIn/tokenOut (normalize to DOT/USDT/WETH), amount precisely")
  lines.push("5. Always reference live prices when available")
  lines.push("6. Suggest USDT for stable operations (primary stablecoin on Polkadot Hub)")
  lines.push("7. When discussing trade safety, mention the approval flow and on-chain verification")
  lines.push("8. For portfolio questions without explicit trade intent: action='portfolio', isTradeIntent=false")
  lines.push("9. 'confidence': 'high' if clear intent, 'medium' if ambiguous, 'low' if unclear")

  return lines.join("\n")
}

// ── Response schema ────────────────────────────────────────────────────────

const TRADE_INTENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    action: {
      type: "STRING",
      enum: [
        "swap", "stake", "unstake", "add_liquidity", "remove_liquidity",
        "portfolio", "price", "balance", "defi", "gas",
        "rebalance", "private_trade", "risk", "info", "none",
      ],
    },
    tokenIn: { type: "STRING" },
    tokenOut: { type: "STRING" },
    amount: { type: "NUMBER" },
    protocol: { type: "STRING" },
    positionId: { type: "STRING" },
    response: { type: "STRING" },
    isTradeIntent: { type: "BOOLEAN" },
    summary: { type: "STRING" },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
    suggestedSlippageBps: { type: "NUMBER" },
  },
  required: ["action", "response", "isTradeIntent"],
}

// ── Main chat function ─────────────────────────────────────────────────────

/**
 * Send a message to Gemini with full portfolio context and get a structured response.
 * The returned TradeIntent can be directly executed by the trade engine.
 */
export async function chatWithGemini(
  message: string,
  context: GeminiContext = {},
  history: ChatMessage[] = [],
): Promise<TradeIntent> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured — add it to .env to enable AI chat")
  }

  const systemPrompt = buildSystemPrompt(context)

  // Build conversation contents (last 8 turns for context window efficiency)
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
  for (const msg of history.slice(-8)) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })
  }
  contents.push({ role: "user", parts: [{ text: message }] })

  const requestBody = {
    contents,
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      responseSchema: TRADE_INTENT_SCHEMA,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    ],
  }

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

  log.info("Calling Gemini API", { model: GEMINI_MODEL, messageLen: message.length })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${errorBody.slice(0, 200)}`)
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
        finishReason?: string
      }>
      error?: { message: string }
    }

    if (data.error) {
      throw new Error(`Gemini error: ${data.error.message}`)
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    if (!rawText) {
      throw new Error("Gemini returned empty response")
    }

    try {
      const parsed = JSON.parse(rawText) as TradeIntent

      // Normalize token symbols
      if (parsed.tokenIn) parsed.tokenIn = normalizeTokenSymbol(parsed.tokenIn)
      if (parsed.tokenOut) parsed.tokenOut = normalizeTokenSymbol(parsed.tokenOut)

      log.info("Gemini response parsed", {
        action: parsed.action,
        isTradeIntent: parsed.isTradeIntent,
        tokenIn: parsed.tokenIn,
        tokenOut: parsed.tokenOut,
        amount: parsed.amount,
      })

      return parsed
    } catch {
      // JSON parse failed — return as plain info response
      log.warn("Failed to parse Gemini JSON response, returning as plain text")
      return {
        action: "info",
        response: rawText,
        isTradeIntent: false,
        confidence: "low",
      }
    }
  } finally {
    clearTimeout(timer)
  }
}

// ── Simpler text-only Gemini call (for non-structured responses) ───────────

/**
 * Call Gemini for a plain text response (no structured schema).
 * Used for generating rich narrative explanations, market analysis, etc.
 */
export async function askGemini(
  prompt: string,
  systemContext?: string,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured")
  }

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(systemContext && {
      systemInstruction: { parts: [{ text: systemContext }] },
    }),
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  }

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`)
    }

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || ""
  } finally {
    clearTimeout(timer)
  }
}

// ── Token normalization ────────────────────────────────────────────────────

function normalizeTokenSymbol(token: string): string {
  const normalized = token.trim().toUpperCase()
  // PAS is the native currency on Polkadot Hub testnet — normalize to DOT
  if (normalized === "PAS") return "DOT"
  if (normalized === "POLKADOT") return "DOT"
  // Common aliases
  const aliases: Record<string, string> = {
    "TETHER": "USDT",
    "USD_TETHER": "USDT",
    "USDC": "USDT",        // redirect USDC requests to USDT on Polkadot Hub
    "WRAPPED_ETH": "WETH",
    "WRAPPED ETH": "WETH",
    "ETHEREUM": "WETH",
    "ETH": "WETH",
  }
  return aliases[normalized] || normalized
}

// ── Portfolio context builder ──────────────────────────────────────────────

/**
 * Build a GeminiContext from available data.
 * Composes portfolio, prices, DeFi, and risk rules into a single context object.
 */
export function buildGeminiContext(
  portfolio: GeminiContext["portfolio"],
  prices: Record<string, number>,
  defiSummary: GeminiContext["defiSummary"],
  riskRules: GeminiContext["riskRules"],
  walletAddress?: string,
): GeminiContext {
  return {
    portfolio,
    prices,
    defiSummary,
    riskRules,
    walletAddress,
    network: POLKADOT_HUB_TESTNET.name,
  }
}
