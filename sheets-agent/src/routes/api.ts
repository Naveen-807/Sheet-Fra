/**
 * Main API router for sheets-first operation.
 */

import { Router, Request, Response, NextFunction } from "express"
import crypto from "crypto"
import exportsRouter from "./exports"
import { getSpreadsheetId, initSheetSetup } from "./shared"
import { getPrice, getPrices } from "../services/price"
import { getNativeBalance, getTokenBalances, formatTokenBalance } from "../services/blockchain"
import { fetchPortfolio } from "../services/portfolio"
import { executeTrade } from "../services/execute"
import { processChatMessage } from "../services/chat"

export { initSheetSetup, startSheetWatcher, stopAllTimers } from "./shared"

/**
 * API key authentication middleware.
 * Requires X-API-Key header matching SHEETFRA_API_KEY env var.
 * In dev mode without the env var, requests are allowed with a warning.
 * /health is exempted.
 */
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (req.path === "/health") {
    next()
    return
  }

  const apiKey = process.env.SHEETFRA_API_KEY || process.env.FRANKY_API_KEY
  if (!apiKey) {
    // Dev mode: allow through but warn on first request
    if (process.env.NODE_ENV !== "production") {
      next()
      return
    }
    res.status(500).json({ error: "Server misconfiguration: SHEETFRA_API_KEY not set" })
    return
  }

  const provided = req.headers["x-api-key"] as string | undefined
  if (!provided) {
    res.status(401).json({ error: "Missing X-API-Key header" })
    return
  }

  const expected = Buffer.from(apiKey, "utf8")
  const received = Buffer.from(provided, "utf8")
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    res.status(403).json({ error: "Invalid API key" })
    return
  }

  next()
}

const router = Router()

router.use(requireApiKey)
router.use(exportsRouter)

router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, timestamp: new Date().toISOString() })
})

router.get("/api/status", (_req: Request, res: Response) => {
  res.json({
    mode: "sheets-only",
    sheetId: getSpreadsheetId() || process.env.GOOGLE_SHEET_ID || null,
    timestamp: new Date().toISOString(),
  })
})

router.post("/api/sheet/setup", async (_req: Request, res: Response) => {
  await initSheetSetup()
  res.json({ ok: true, message: "Sheet setup completed" })
})

// ── Real data API routes ─────────────────────────────────────

router.get("/api/price", async (req: Request, res: Response) => {
  try {
    const pair = (req.query.pair as string) || "DOT_USD"
    const price = await getPrice(pair)
    res.json({ pair, price, timestamp: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get("/api/prices", async (_req: Request, res: Response) => {
  try {
    const prices = await getPrices()
    res.json({ prices, timestamp: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get("/api/balance", async (req: Request, res: Response) => {
  try {
    const wallet = (req.query.wallet as string) || process.env.WALLET_ADDRESS
    if (!wallet) {
      res.status(400).json({ error: "wallet query param or WALLET_ADDRESS env var required" })
      return
    }
    const token = ((req.query.token as string) || "DOT").toUpperCase()
    if (token === "DOT" || token === "PAS") {
      const raw = await getNativeBalance(wallet)
      const formatted = formatTokenBalance(raw, 10)
      res.json({ token, balance: formatted, balanceRaw: raw, decimals: 10, wallet })
    } else {
      const balances = await getTokenBalances(wallet)
      const raw = balances[token as keyof typeof balances] || "0"
      const decimals = token === "USDT" ? 6 : 18
      const formatted = formatTokenBalance(raw, decimals)
      res.json({ token, balance: formatted, balanceRaw: raw, decimals, wallet })
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.get("/api/portfolio", async (req: Request, res: Response) => {
  try {
    const wallet = (req.query.wallet as string) || process.env.WALLET_ADDRESS
    if (!wallet) {
      res.status(400).json({ error: "wallet query param or WALLET_ADDRESS env var required" })
      return
    }
    const portfolio = await fetchPortfolio(wallet)
    res.json(portfolio)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post("/api/execute", async (req: Request, res: Response) => {
  try {
    const { tokenIn, tokenOut, amount, slippageBps } = req.body || {}
    if (!tokenIn || !tokenOut || !amount) {
      res.status(400).json({ error: "tokenIn, tokenOut, and amount are required" })
      return
    }
    const spreadsheetId = getSpreadsheetId() || process.env.GOOGLE_SHEET_ID || ""
    const result = await executeTrade({
      tokenIn,
      tokenOut,
      amount: Number(amount),
      slippageBps: slippageBps ? Number(slippageBps) : undefined,
      spreadsheetId,
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { message } = req.body || {}
    if (!message) {
      res.status(400).json({ error: "message is required" })
      return
    }
    const spreadsheetId = getSpreadsheetId() || process.env.GOOGLE_SHEET_ID || ""
    const result = await processChatMessage(message, spreadsheetId)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
