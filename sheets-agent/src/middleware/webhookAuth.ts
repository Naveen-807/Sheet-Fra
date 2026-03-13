import { Request, Response, NextFunction } from "express"
import crypto from "crypto"

/**
 * Authenticates incoming webhook requests.
 *
 * Supports two modes (checked in order):
 *
 * 1. Static Bearer token:
 *    Set WEBHOOK_TOKEN. Callers send it via the X-Webhook-Token header.
 *
 * 2. HMAC-SHA256 signature:
 *    Custom integrations set WEBHOOK_SECRET and send:
 *      X-Webhook-Signature: HMAC-SHA256(WEBHOOK_SECRET, rawBody)
 *
 * In development mode (NODE_ENV !== "production" and no secrets configured),
 * requests are allowed through with a warning.
 */
export function verifyWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const webhookSecret = process.env.WEBHOOK_SECRET || ""
  const webhookToken = process.env.WEBHOOK_TOKEN || ""
  const isProduction = process.env.NODE_ENV === "production"
  const requestId = String(req.requestId || req.headers["x-request-id"] || "unknown")
  const clientIp = (req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "")
  const isLoopback = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost"
  const allowLocalBypass = process.env.ALLOW_LOOPBACK_WEBHOOK_BYPASS === "true"

  // Check: at least one auth method must be configured in production
  if (!webhookSecret && !webhookToken) {
    if (isProduction) {
      console.error(`[Auth] [${requestId}] CRITICAL: No webhook secrets configured in production`) 
      res.status(500).json({ error: "Server misconfiguration: webhook auth not set up" })
      return
    }
    console.warn(`[Auth] [${requestId}] No webhook secrets configured — auth disabled (dev mode)`)
    next()
    return
  }

  if (!isProduction && isLoopback && allowLocalBypass) {
    console.warn(`[Auth] [${requestId}] Loopback request allowed by ALLOW_LOOPBACK_WEBHOOK_BYPASS=true`)
    next()
    return
  }

  // --- Mode 1: Static bearer token ---
  const tokenHeader = req.headers["x-webhook-token"] as string | undefined
  if (webhookToken && tokenHeader) {
    const expected = Buffer.from(webhookToken)
    const received = Buffer.from(tokenHeader)
    if (
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received)
    ) {
      next()
      return
    }
    console.warn(`[Auth] [${requestId}] Invalid X-Webhook-Token`)
    res.status(403).json({ error: "Invalid webhook token" })
    return
  }

  // --- Mode 2: HMAC-SHA256 signature ---
  const signatureHeader = req.headers["x-webhook-signature"] as string | undefined
  if (webhookSecret && signatureHeader) {
    // Use the raw body buffer captured by express.json verify callback
    // to avoid signature mismatches from JSON re-serialization.
    const rawBody = req.rawBody
    const bodyToSign = rawBody || Buffer.from(JSON.stringify(req.body), "utf8")
    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(bodyToSign)
      .digest("hex")
    const received = signatureHeader.startsWith("sha256=")
      ? signatureHeader.slice("sha256=".length)
      : signatureHeader

    if (
      received.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    ) {
      next()
      return
    }
    console.warn(`[Auth] [${requestId}] Invalid X-Webhook-Signature`)
    res.status(403).json({ error: "Invalid webhook signature" })
    return
  }

  // No valid auth header provided
  res.status(401).json({
    error: "Missing authentication: provide X-Webhook-Token or X-Webhook-Signature header",
  })
}
