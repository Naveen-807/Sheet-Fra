/**
 * Event deduplication — prevents processing the same transaction hash twice.
 */

const seenTxHashes = new Map<string, number>()
const DEDUP_TTL_MS = 10 * 60 * 1000

export function isDuplicateEvent(txHash: string): boolean {
  const now = Date.now()
  for (const [hash, ts] of seenTxHashes) {
    if (now - ts > DEDUP_TTL_MS) seenTxHashes.delete(hash)
  }
  if (seenTxHashes.has(txHash)) return true
  seenTxHashes.set(txHash, now)
  return false
}
