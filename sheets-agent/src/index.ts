import express from "express"
import cors from "cors"
import helmet from "helmet"
import dotenv from "dotenv"
dotenv.config()

import { createLogger } from "./utils/logger"
import { printStartupBanner } from "./utils/banner"
const log = createLogger("server")

import apiRouter, { initSheetSetup, startSheetWatcher, stopAllTimers } from "./routes/api"
import { restoreGuardrailState } from "./routes/guardrails"
import { attachRequestContext, getRequestId } from "./middleware/requestContext"
import { stopRateLimitTimer } from "./middleware/rateLimit"
import fs from "fs"

// ── Environment Validation ─────────────────────────────────
function validateEnvironment(): string[] {
  const warnings: string[] = []
  const errors: string[] = []

  // Required
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    errors.push("GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required (path to service account JSON key)")
  } else if (!fs.existsSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH)) {
    errors.push(`GOOGLE_SERVICE_ACCOUNT_KEY_PATH file not found: ${process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH}`)
  }

  // Warnings for optional but recommended
  if (!process.env.GEMINI_API_KEY) {
    warnings.push("GEMINI_API_KEY not set — AI chat will be unavailable")
  }

  if (errors.length > 0) {
    console.error("\n╔══════════════════════════════════════════════════════╗")
    console.error("║  STARTUP FAILED — Missing required configuration     ║")
    console.error("╚══════════════════════════════════════════════════════╝")
    errors.forEach(e => console.error(`  ✗ ${e}`))
    console.error("\n  Copy .env.example to .env and fill in the required values.\n")
    process.exit(1)
  }

  return warnings
}

const envWarnings = validateEnvironment()

const app = express()
const PORT = process.env.PORT || 3000

// Security: trust first proxy (for correct req.ip behind reverse proxy)
app.set("trust proxy", 1)

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))

// Middleware
app.use(cors({
  origin: process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map(s => s.trim())
    : ["https://docs.google.com", "https://sheets.googleapis.com"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Webhook-Token", "X-Webhook-Signature", "X-API-Key", "X-Request-Id", "X-Idempotency-Key"],
  credentials: false,
}))
// Capture raw body for HMAC verification before JSON parsing
app.use(express.json({
  limit: "256kb",
  verify: (req: express.Request, _res, buf) => {
    req.rawBody = buf
  },
}))

app.use(attachRequestContext)

// Request logging with response timing
app.use((req, res, next) => {
  const requestId = getRequestId(req)
  const start = Date.now()
  log.info(`${req.method} ${req.path}`, { requestId })
  res.on("finish", () => {
    const duration = Date.now() - start
    try { res.setHeader("X-Response-Time", `${duration}ms`) } catch { /* headers already sent */ }
    log.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, { requestId, status: res.statusCode, duration })
  })
  next()
})

// API routes
app.use(apiRouter)

// Root
app.get("/", (_req, res) => {
  res.json({
    name: "SheetFra Sheets Gateway",
    description:
      "Google Sheets-first DeFi gateway for Polkadot Hub",
    version: "1.0.0",
    architecture: {
      core: "sheets-first",
      control_plane: "sheet watcher + local command routing",
      agent_role: "sheet bridge",
      transaction_flow: "Sheet → Agent → response/logging",
    },
    endpoints: {
      api: {
        "GET /api/status": "Sheets mode status and active sheet ID",
        "POST /api/sheet/setup": "Initialize/repair required sheets tabs",
        "GET /api/export/trades": "Export trade history as CSV or JSON",
        "GET /api/export/portfolio": "Export current portfolio as CSV or JSON",
      },
      system: {
        "GET /health": "Health check with uptime",
      },
    },
    tracks: [
      "EVM Smart Contract",
      "DeFi & Stablecoin",
      "AI-powered dApps",
    ],
    integrations: {
      "Google Sheets": "Primary interaction and automation surface",
    },
  })
})

// Start server
const server = app.listen(PORT, () => {
  printStartupBanner(PORT)

  // Show warnings
  if (envWarnings.length > 0) {
    log.warn("Configuration warnings:")
    envWarnings.forEach(w => log.warn(w))
  }

  // Restore guardrail state (daily volume, cooldown) from Sheets Settings tab
  restoreGuardrailState().catch(err => {
    log.warn("Guardrail state restore failed (will use defaults)", { error: err instanceof Error ? err.message : String(err) })
  })

  // Run sheet auto-setup AFTER dotenv has loaded env vars, then start watcher
  initSheetSetup()
    .then(() => startSheetWatcher())
    .catch(err => {
      log.error("Sheet auto-setup failed", { error: err instanceof Error ? err.message : String(err) })
    })
})

// Graceful shutdown
function shutdown() {
  log.info("Shutting down gracefully...")
  stopAllTimers()
  stopRateLimitTimer()
  server.close(() => {
    log.info("Server closed")
    process.exit(0)
  })
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
