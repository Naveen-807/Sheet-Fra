/**
 * Planned leg registry — tracks rebalance plan legs for execution approval.
 */

import type { RebalancePlan, RebalanceLeg } from "../types"

export type PlannedLegContext = {
  plan: RebalancePlan
  leg: RebalanceLeg
  walletAddress: string
  defaultSlippageBps: number
}

export interface ExecuteApprovalPayload extends Record<string, unknown> {
  approved?: boolean
  reason?: string
  tokenInPrice?: string
  tokenOutPrice?: string
  priceDecimals?: number
  chainlinkPrice?: string
  approvedPayloadHash?: string
  executionAttestationId?: string
  executionRequestId?: string
  planLegId?: string
  rebalancePlanId?: string
  selectedVenue?: string
  privacyMode?: boolean
  calldata?: Array<{ to: string; data: string; value: string; gasLimit: number; description: string }>
  tokenOutDecimals?: number
}

export type ExecutionPayloadShape = {
  tokenIn: string
  tokenOut: string
  amount: number
  slippageBps: number
  secretId: string
  sheetId: string
  planLegId?: string
  rebalancePlanId?: string
}

const PLAN_LEG_TTL_MS = 60 * 60 * 1000 // 1 hour
const plannedLegRegistry = new Map<string, PlannedLegContext & { registeredAt: number }>()

export function registerRebalancePlan(plan: RebalancePlan, walletAddress: string, defaultSlippageBps: number = 50): void {
  const now = Date.now()
  // Clean expired entries on every register call
  for (const [id, entry] of plannedLegRegistry) {
    if (now - entry.registeredAt > PLAN_LEG_TTL_MS) plannedLegRegistry.delete(id)
  }
  for (const leg of plan.legs) {
    plannedLegRegistry.set(leg.planLegId, {
      plan,
      leg,
      walletAddress,
      defaultSlippageBps,
      registeredAt: now,
    })
  }
}

export function getRegisteredPlanLeg(planLegId: string): PlannedLegContext | undefined {
  const entry = plannedLegRegistry.get(planLegId)
  if (!entry) return undefined
  if (Date.now() - entry.registeredAt > PLAN_LEG_TTL_MS) {
    plannedLegRegistry.delete(planLegId)
    return undefined
  }
  return entry
}

export function consumeRegisteredPlanLeg(planLegId: string): PlannedLegContext | undefined {
  const entry = getRegisteredPlanLeg(planLegId)
  if (entry) plannedLegRegistry.delete(planLegId)
  return entry
}
