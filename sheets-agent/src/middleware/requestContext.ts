import type { NextFunction, Request, Response } from "express"
import crypto from "crypto"

const REQUEST_ID_HEADER = "x-request-id"

export function getRequestId(req: Request): string {
  return req.requestId || "unknown"
}

export function attachRequestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER]
  const requestId = typeof incoming === "string" && incoming.trim() ? incoming.trim() : crypto.randomUUID()

  req.requestId = requestId
  res.locals.requestId = requestId
  res.setHeader("X-Request-Id", requestId)

  next()
}
