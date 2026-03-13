/**
 * Trade memo, policy check, and drift builders.
 */

import { createHash } from "crypto"
import type { PolicyCheckResult, RiskRules } from "../types"
import {
  lastExecutionTime,
  resetDailyVolumeIfNeeded,
  dailyVolumeUsd,
  estimateTradeUsdValue,
} from "./guardrails"
import type { ExecutionPayloadShape } from "./planLegRegistry"

export async function buildPolicyChecks(
  rules: RiskRules,
  tokenIn: string,
  tokenOut: string,
  amount: number,
  slippageBps: number,
  precomputedTradeUsd?: number
): Promise<PolicyCheckResult[]> {
  const checks: PolicyCheckResult[] = []
  checks.push({
    rule: "Slippage",
    value: `${slippageBps}bps`,
    limit: `${rules.maxSlippageBps}bps`,
    passed: slippageBps <= rules.maxSlippageBps,
  })
  checks.push({
    rule: "Allowed Asset In",
    value: tokenIn,
    limit: rules.allowedAssets.join(","),
    passed: rules.allowedAssets.includes(tokenIn),
  })
  checks.push({
    rule: "Allowed Asset Out",
    value: tokenOut,
    limit: rules.allowedAssets.join(","),
    passed: rules.allowedAssets.includes(tokenOut),
  })
  const elapsed = lastExecutionTime > 0 ? (Date.now() - lastExecutionTime) / 60_000 : Infinity
  checks.push({
    rule: "Cooldown",
    value: elapsed === Infinity ? "N/A" : `${Math.floor(elapsed)}min`,
    limit: `${rules.cooldownMinutes}min`,
    passed: elapsed >= rules.cooldownMinutes || lastExecutionTime === 0,
  })
  resetDailyVolumeIfNeeded()
  const tradeUsd = precomputedTradeUsd ?? await estimateTradeUsdValue(tokenIn, amount)
  checks.push({
    rule: "Daily Volume",
    value: `$${(dailyVolumeUsd + tradeUsd).toFixed(0)}`,
    limit: `$${rules.maxDailyVolumeUsd}`,
    passed: dailyVolumeUsd + tradeUsd <= rules.maxDailyVolumeUsd,
  })
  return checks
}

export function computeCurrentDrift(
  currentAllocations: Record<string, number>,
  targetAllocations: Record<string, number>
): Record<string, number> {
  const drift: Record<string, number> = {}
  for (const [token, target] of Object.entries(targetAllocations)) {
    drift[token] = (currentAllocations[token] || 0) - target
  }
  return drift
}

export function buildExecutionPayloadHash(payload: ExecutionPayloadShape): string {
  const canonical = JSON.stringify({
    amount: Number(payload.amount.toFixed(6)),
    planLegId: payload.planLegId || "",
    rebalancePlanId: payload.rebalancePlanId || "",
    secretId: payload.secretId,
    sheetId: payload.sheetId.trim(),
    slippageBps: payload.slippageBps,
    tokenIn: payload.tokenIn,
    tokenOut: payload.tokenOut,
  })
  return `0x${createHash("sha256").update(canonical).digest("hex")}`
}
