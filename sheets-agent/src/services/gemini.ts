/**
 * Direct Gemini 2.0 Flash API client for FrankySheets.
 *
 * Used as the primary AI layer for natural-language DeFi operations.
 * Architecture: Gemini parses intent → CRE verifies → Nillion signs → chain settles.
 *
 * Falls back gracefully when GEMINI_API_KEY is not set.
 */

import { createLogger } from "../utils/logger"

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
    "You are FrankySheets — the world's most advanced AI DeFi treasury assistant, embedded directly in Google Sheets.",
    "You are powered by Chainlink CRE (9 BFT-verified DON workflows), Pyth Network dual-oracle verification,",
    "Nillion TEE for privacy-preserving key management, Uniswap V3 for execution, and Gemini AI for intelligence.",
    "",
    "CORE IDENTITY:",
    "- You turn spreadsheet cells into verifiable DeFi operations",
    "- Every trade you suggest is verified by Chainlink BFT consensus + Pyth dual-oracle before execution",
    "- Your wallet keys are stored in Nillion's Secret Vault (never on disk)",
    "- You support private trades via CRE ConfidentialHTTPClient (TEE-protected API keys)",
    "",
    "SUPPORTED TOKENS (Ethereum Sepolia):",
    "- WETH (Wrapped ETH): 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    "- USDC: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    "- LINK: 0x779877A7B0D9E8603169DdbD7836e478b4624789",
    "- PYUSD (PayPal USD): 0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9",
    "",
    "DEFI CAPABILITIES:",
    "- Execute swaps via Uniswap V3 (CRE-verified calldata)",
    "- Stake ETH via Lido (4.2% APR), LINK via Chainlink Staking (5.85% APR), USDC/PYUSD via Compound",
    "- Provide liquidity on Uniswap V3 USDC/WETH (18.7% APY) and Curve PYUSD/USDC (8.34% APY)",
    "- Private trade discovery via 1inch + 0x APIs in CRE TEE (no strategy leakage)",
    "- Portfolio rebalancing with AI-planned legs verified by CRE DON",
    "- Cross-chain portfolio: Ethereum Sepolia + Avalanche Fuji",
    "",
  ]

  if (context.walletAddress) {
    lines.push(`CONNECTED WALLET: ${context.walletAddress}`)
    lines.push(`NETWORK: ${context.network || "Ethereum Sepolia"}`)
    lines.push("")
  }

  if (context.portfolio && context.portfolio.tokens.length > 0) {
    lines.push("CURRENT PORTFOLIO:")
    lines.push(`  Total Value: $${context.portfolio.totalValueUsd.toFixed(2)}`)
    for (const t of context.portfolio.tokens) {
      const bal = t.symbol === "USDC" || t.symbol === "PYUSD"
        ? t.balance.toFixed(2)
        : t.balance.toFixed(6)
      lines.push(`  ${t.symbol}: ${bal} ($${t.valueUsd.toFixed(2)})`)
    }
    lines.push("")
  }

  if (context.prices && Object.keys(context.prices).length > 0) {
    lines.push("LIVE PRICES (Chainlink BFT consensus):")
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
    lines.push("ACTIVE RISK RULES (enforced by CRE RiskVault on-chain):")
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
  lines.push("4. For trade intents: extract tokenIn/tokenOut (normalize to WETH/USDC/LINK/PYUSD), amount precisely")
  lines.push("5. Always reference live prices when available")
  lines.push("6. Suggest PYUSD for stable operations (PayPal USD integration)")
  lines.push("7. Mention CRE BFT verification and Pyth dual-oracle when discussing trade safety")
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
  // ETH is not ERC20-compatible with Uniswap V3 router — always use WETH
  if (normalized === "ETH") return "WETH"
  // Common aliases
  const aliases: Record<string, string> = {
    "ETHEREUM": "WETH",
    "WRAPPED_ETH": "WETH",
    "WRAPPED ETH": "WETH",
    "USD_COIN": "USDC",
    "CHAINLINK": "LINK",
    "PAYPAL_USD": "PYUSD",
    "PAYPAL USD": "PYUSD",
    "PAY": "PYUSD",
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
    network: "Ethereum Sepolia",
  }
}
