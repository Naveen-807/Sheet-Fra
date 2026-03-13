/**
 * Main API router for sheets-first operation.
 */

import { Router, Request, Response, NextFunction } from "express"
import crypto from "crypto"
import exportsRouter from "./exports"
import { getSpreadsheetId, initSheetSetup } from "./shared"

export { initSheetSetup, startSheetWatcher, stopAllTimers } from "./shared"

/**
 * API key authentication middleware.
 * Requires X-API-Key header matching FRANKY_API_KEY env var.
 * In dev mode without the env var, requests are allowed with a warning.
 * /health is exempted.
 */
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (req.path === "/health") {
    next()
    return
  }

  const apiKey = process.env.FRANKY_API_KEY
  if (!apiKey) {
    // Dev mode: allow through but warn on first request
    if (process.env.NODE_ENV !== "production") {
      next()
      return
    }
    res.status(500).json({ error: "Server misconfiguration: FRANKY_API_KEY not set" })
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

export default router
