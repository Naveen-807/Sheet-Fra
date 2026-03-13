/**
 * Pre-trade allocation snapshots — stored before trades for reconciliation.
 */

import type { AllocationSnapshot } from "../types"

const preTradeSnapshots = new Map<string, AllocationSnapshot>()
export const SNAPSHOT_TTL_MS = 10 * 60 * 1000

export function storePreTradeSnapshot(tradeRef: string, snapshot: AllocationSnapshot): void {
  const now = Date.now()
  for (const [ref, snap] of preTradeSnapshots) {
    if (now - snap.timestamp > SNAPSHOT_TTL_MS) preTradeSnapshots.delete(ref)
  }
  preTradeSnapshots.set(tradeRef, snapshot)
}

export function getPreTradeSnapshotsSize(): number {
  return preTradeSnapshots.size
}

export function getAllPreTradeSnapshots(): Map<string, AllocationSnapshot> {
  return preTradeSnapshots
}
