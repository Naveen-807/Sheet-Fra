/**
 * Reusable input validation middleware.
 *
 * Apply as Express middleware on routes instead of inline validation.
 * Each validator returns a middleware function that sends a 400 error
 * if validation fails, or calls next() on success.
 */

import type { Request, Response, NextFunction } from "express"

const WALLET_REGEX = /^0x[0-9a-fA-F]{40}$/
const BYTES32_REGEX = /^0x[a-fA-F0-9]{64}$/

/**
 * Validate a wallet address from query or body.
 */
export function validateWalletAddress(field: string, source: "query" | "body" = "query") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = String(
      source === "query" ? req.query[field] : req.body?.[field] || ""
    ).trim()
    if (!value) {
      res.status(400).json({ error: `Missing '${field}' parameter` })
      return
    }
    if (!WALLET_REGEX.test(value)) {
      res.status(400).json({ error: `Invalid wallet address format in '${field}'` })
      return
    }
    next()
  }
}

/**
 * Validate a token symbol is in the supported list.
 */
export function validateToken(field: string, supported: string[], source: "query" | "body" = "query") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = String(
      source === "query" ? req.query[field] : req.body?.[field] || ""
    ).trim().toUpperCase()
    if (!value) {
      res.status(400).json({ error: `Missing '${field}' parameter` })
      return
    }
    if (!supported.includes(value)) {
      res.status(400).json({
        error: `Unsupported token: ${value}`,
        supported,
      })
      return
    }
    next()
  }
}

/**
 * Validate a price pair is in the supported list.
 */
export function validatePair(field: string, supported: string[], source: "query" | "body" = "query") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = String(
      source === "query" ? req.query[field] : req.body?.[field] || ""
    ).trim().toUpperCase()
    if (!value) {
      res.status(400).json({ error: `Missing '${field}' parameter` })
      return
    }
    if (!supported.includes(value)) {
      res.status(400).json({
        error: `Unsupported pair: ${value}`,
        supported,
      })
      return
    }
    next()
  }
}

/**
 * Validate a numeric amount > 0.
 */
export function validateAmount(field: string, source: "query" | "body" = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = source === "query" ? req.query[field] : req.body?.[field]
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) {
      res.status(400).json({ error: `Invalid or missing '${field}': must be a positive number` })
      return
    }
    next()
  }
}

/**
 * Validate a bytes32 hash (e.g. walletHash).
 */
export function validateBytes32(field: string, source: "query" | "body" = "query") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = String(
      source === "query" ? req.query[field] : req.body?.[field] || ""
    ).trim()
    if (!value || !BYTES32_REGEX.test(value)) {
      res.status(400).json({ error: `Missing or invalid '${field}' (expected bytes32 hex)` })
      return
    }
    next()
  }
}

/**
 * Validate a required string field is present and non-empty.
 */
export function validateRequired(field: string, source: "query" | "body" = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = source === "query" ? req.query[field] : req.body?.[field]
    if (!value || (typeof value === "string" && !value.trim())) {
      res.status(400).json({ error: `Missing required '${field}' parameter` })
      return
    }
    next()
  }
}

/**
 * Validate string length.
 */
export function validateMaxLength(field: string, maxLength: number, source: "query" | "body" = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = String(source === "query" ? req.query[field] : req.body?.[field] || "")
    if (value.length > maxLength) {
      res.status(400).json({ error: `'${field}' exceeds maximum length of ${maxLength} characters` })
      return
    }
    next()
  }
}
