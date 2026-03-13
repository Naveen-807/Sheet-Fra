/**
 * Standardized API response helpers.
 *
 * Ensures every error response includes a consistent shape:
 *   { error: string, reason?: string, source?: string, requestId?: string }
 */

import type { Response } from "express"

export interface ApiErrorBody {
  error: string
  reason?: string
  source?: string
  requestId?: string
}

/**
 * Send a standardized error response.
 */
export function sendError(
  res: Response,
  status: number,
  error: string,
  opts?: { reason?: string; source?: string; requestId?: string }
): void {
  const body: ApiErrorBody = { error }
  if (opts?.reason) body.reason = opts.reason
  if (opts?.source) body.source = opts.source

  // Auto-inject requestId from response locals (set by requestContext middleware)
  const requestId = opts?.requestId || (res.locals as { requestId?: string }).requestId
  if (requestId) body.requestId = requestId

  res.status(status).json(body)
}

/**
 * Send a standardized success response.
 */
export function sendSuccess<T extends Record<string, unknown>>(
  res: Response,
  data: T
): void {
  res.json(data)
}
