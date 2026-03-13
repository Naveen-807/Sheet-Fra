import type { ExecutionTranscriptRow } from "../types"
import { appendExecutionTranscriptRow, updateExecutionTranscriptRow } from "./sheets"
import { createLogger } from "../utils/logger"

const log = createLogger("execution-ledger")

type ExecutionLedgerEntry = ExecutionTranscriptRow & {
  rowNumber?: number
  spreadsheetId: string
  updatedAt: number
}

type StartExecutionInput = {
  spreadsheetId: string
  requestId: string
  source: string
  command: string
  parsedAction?: string
  workflow?: string
  status?: string
  cliCommand?: string
  cliOutput?: string
  txHash?: string
  explorerUrl?: string
  result?: string
}

type UpdateExecutionInput = Partial<Omit<ExecutionTranscriptRow, "requestId">> & {
  requestId: string
}

const TTL_MS = 30 * 60 * 1000
const store = new Map<string, ExecutionLedgerEntry>()

function cleanup(): void {
  const now = Date.now()
  for (const [requestId, entry] of store.entries()) {
    if (now - entry.updatedAt > TTL_MS) {
      store.delete(requestId)
    }
  }
}

function makeBaseRow(input: StartExecutionInput): ExecutionLedgerEntry {
  return {
    spreadsheetId: input.spreadsheetId,
    timestamp: new Date().toISOString(),
    requestId: input.requestId,
    source: input.source,
    command: input.command,
    parsedAction: input.parsedAction || "Queued",
    workflow: input.workflow || "pending",
    status: input.status || "QUEUED",
    cliCommand: input.cliCommand || "",
    cliOutput: input.cliOutput || "",
    txHash: input.txHash || "",
    explorerUrl: input.explorerUrl || "",
    result: input.result || "Queued from sheet",
    updatedAt: Date.now(),
  }
}

function mergeEntry(entry: ExecutionLedgerEntry, patch: UpdateExecutionInput): ExecutionLedgerEntry {
  return {
    ...entry,
    timestamp: patch.timestamp || entry.timestamp,
    source: patch.source || entry.source,
    command: patch.command || entry.command,
    parsedAction: patch.parsedAction || entry.parsedAction,
    workflow: patch.workflow || entry.workflow,
    status: patch.status || entry.status,
    cliCommand: patch.cliCommand !== undefined ? patch.cliCommand : entry.cliCommand,
    cliOutput: patch.cliOutput !== undefined ? patch.cliOutput : entry.cliOutput,
    txHash: patch.txHash !== undefined ? patch.txHash : entry.txHash,
    explorerUrl: patch.explorerUrl !== undefined ? patch.explorerUrl : entry.explorerUrl,
    result: patch.result !== undefined ? patch.result : entry.result,
    updatedAt: Date.now(),
  }
}

async function persist(entry: ExecutionLedgerEntry): Promise<void> {
  const rowPayload: ExecutionTranscriptRow = {
    timestamp: entry.timestamp,
    requestId: entry.requestId,
    source: entry.source,
    command: entry.command,
    parsedAction: entry.parsedAction,
    workflow: entry.workflow,
    status: entry.status,
    cliCommand: entry.cliCommand,
    cliOutput: entry.cliOutput,
    txHash: entry.txHash,
    explorerUrl: entry.explorerUrl,
    result: entry.result,
  }

  if (entry.rowNumber) {
    await updateExecutionTranscriptRow(entry.spreadsheetId, entry.rowNumber, rowPayload)
    return
  }

  const rowNumber = await appendExecutionTranscriptRow(entry.spreadsheetId, rowPayload)
  if (rowNumber) entry.rowNumber = rowNumber
}

export async function startExecutionRecord(input: StartExecutionInput): Promise<void> {
  cleanup()
  const entry = makeBaseRow(input)
  store.set(input.requestId, entry)
  try {
    await persist(entry)
  } catch (error) {
    log.warn("Failed to create execution transcript row", { requestId: input.requestId, error: error instanceof Error ? error.message : String(error) })
  }
}

export async function updateExecutionRecord(patch: UpdateExecutionInput): Promise<void> {
  cleanup()
  const existing = store.get(patch.requestId)
  if (!existing) return
  const next = mergeEntry(existing, patch)
  store.set(patch.requestId, next)
  try {
    await persist(next)
  } catch (error) {
    log.warn("Failed to update execution transcript row", { requestId: patch.requestId, error: error instanceof Error ? error.message : String(error) })
  }
}

export async function completeExecutionRecord(
  requestId: string,
  patch: Omit<UpdateExecutionInput, "requestId"> = {},
): Promise<void> {
  await updateExecutionRecord({
    requestId,
    status: patch.status || "COMPLETED",
    result: patch.result || "Execution completed",
    ...patch,
  })
}

export async function failExecutionRecord(
  requestId: string,
  reason: string,
  patch: Omit<UpdateExecutionInput, "requestId"> = {},
): Promise<void> {
  await updateExecutionRecord({
    requestId,
    status: patch.status || "FAILED",
    result: reason,
    ...patch,
  })
}

export function getExecutionRecord(requestId: string): ExecutionTranscriptRow | null {
  const entry = store.get(requestId)
  if (!entry) return null
  return {
    timestamp: entry.timestamp,
    requestId: entry.requestId,
    source: entry.source,
    command: entry.command,
    parsedAction: entry.parsedAction,
    workflow: entry.workflow,
    status: entry.status,
    cliCommand: entry.cliCommand,
    cliOutput: entry.cliOutput,
    txHash: entry.txHash,
    explorerUrl: entry.explorerUrl,
    result: entry.result,
  }
}
