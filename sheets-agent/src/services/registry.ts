/**
 * SheetFraRegistry integration — on-chain audit trail via viem.
 *
 * Uses keccak256 (matching Solidity) for hashing and viem writeContract
 * to call SheetFraRegistry.registerAction() on Polkadot Hub.
 */

import { keccak256, toBytes, createWalletClient, http, type Address, type Hash } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { createLogger } from "../utils/logger"
import { appendAgentLog } from "./sheets"
import { POLKADOT_HUB_TESTNET } from "../config/polkadot-hub"

const log = createLogger("registry")

// Action types matching SheetFraRegistry.sol constants
export const ACTION_SWAP = 1
export const ACTION_STAKE = 2
export const ACTION_APPROVE = 3
export const ACTION_XCM = 4

export interface RegistryAction {
  sheetId: string
  wallet?: string
  actionType: number
  actionDetails: string // human-readable description
  sheetHash: string     // keccak256 of sheetId
  actionHash: string    // keccak256 of action details
  timestamp: string
}

// SheetFraRegistry ABI (only registerAction)
const REGISTRY_ABI = [
  {
    name: "registerAction",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sheetHash", type: "bytes32" },
      { name: "actionHash", type: "bytes32" },
      { name: "actionType", type: "uint8" },
    ],
    outputs: [],
  },
] as const

const polkadotHubChain = {
  id: POLKADOT_HUB_TESTNET.chainId,
  name: POLKADOT_HUB_TESTNET.name,
  nativeCurrency: POLKADOT_HUB_TESTNET.nativeCurrency,
  rpcUrls: {
    default: { http: [POLKADOT_HUB_TESTNET.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: POLKADOT_HUB_TESTNET.blockExplorer },
  },
} as const

/**
 * Compute a keccak256 hash (EVM-compatible, matches Solidity).
 */
function computeHash(data: string): `0x${string}` {
  return keccak256(toBytes(data))
}

/**
 * Build a registry action record for a swap.
 */
export function buildSwapAction(
  sheetId: string,
  tokenIn: string,
  tokenOut: string,
  amount: number,
  wallet?: string,
): RegistryAction {
  const timestamp = new Date().toISOString()
  const actionDetails = `swap:${amount}:${tokenIn}:${tokenOut}:${timestamp}`

  return {
    sheetId,
    wallet,
    actionType: ACTION_SWAP,
    actionDetails: `Swap ${amount} ${tokenIn} → ${tokenOut}`,
    sheetHash: computeHash(sheetId),
    actionHash: computeHash(actionDetails),
    timestamp,
  }
}

/**
 * Log a registry action to the Agent Logs tab and console.
 * Also submits on-chain if SHEETFRA_REGISTRY_ADDRESS and DEPLOYER_PRIVATE_KEY are set.
 */
export async function logRegistryAction(
  spreadsheetId: string,
  action: RegistryAction,
): Promise<void> {
  log.info("Registry action prepared", {
    actionType: action.actionType,
    actionDetails: action.actionDetails,
    sheetHash: action.sheetHash.slice(0, 18) + "...",
    actionHash: action.actionHash.slice(0, 18) + "...",
  })

  // Log to Agent Logs tab for audit trail visibility
  await appendAgentLog(
    spreadsheetId,
    "registry_action",
    `${action.actionDetails} | sheetHash: ${action.sheetHash.slice(0, 18)}... | actionHash: ${action.actionHash.slice(0, 18)}...`,
    undefined,
  ).catch(() => {})
}

/**
 * Submit a registry action on-chain via SheetFraRegistry.registerAction().
 * Requires SHEETFRA_REGISTRY_ADDRESS and DEPLOYER_PRIVATE_KEY env vars.
 */
export async function submitRegistryAction(
  spreadsheetId: string,
  params: {
    tokenIn: string
    tokenOut: string
    amount: number
    txHash: string
    actionType: number
  },
): Promise<Hash | null> {
  const registryAddress = process.env.SHEETFRA_REGISTRY_ADDRESS
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY

  if (!registryAddress || !privateKey) {
    log.info("Registry on-chain submission skipped (SHEETFRA_REGISTRY_ADDRESS or DEPLOYER_PRIVATE_KEY not set)")
    // Still log to Agent Logs
    const action = buildSwapAction(spreadsheetId, params.tokenIn, params.tokenOut, params.amount)
    await logRegistryAction(spreadsheetId, action)
    return null
  }

  const sheetHash = computeHash(spreadsheetId)
  const actionDetails = `swap:${params.amount}:${params.tokenIn}:${params.tokenOut}:${params.txHash}`
  const actionHash = computeHash(actionDetails)

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`)
    const wallet = createWalletClient({
      account,
      chain: polkadotHubChain,
      transport: http(POLKADOT_HUB_TESTNET.rpcUrl),
    })

    const txHash = await wallet.writeContract({
      account,
      address: registryAddress as Address,
      abi: REGISTRY_ABI,
      functionName: "registerAction",
      args: [sheetHash, actionHash, params.actionType],
      chain: polkadotHubChain,
    })

    log.info("Registry action submitted on-chain", {
      txHash,
      sheetHash: sheetHash.slice(0, 18) + "...",
      actionHash: actionHash.slice(0, 18) + "...",
    })

    // Also log to Agent Logs
    await appendAgentLog(
      spreadsheetId,
      "registry_onchain",
      `On-chain registerAction tx: ${txHash} | swap ${params.amount} ${params.tokenIn} → ${params.tokenOut}`,
      txHash,
    ).catch(() => {})

    return txHash
  } catch (err) {
    log.error("Registry on-chain submission failed", { error: (err as Error).message })
    // Fall back to log-only
    const action = buildSwapAction(spreadsheetId, params.tokenIn, params.tokenOut, params.amount)
    await logRegistryAction(spreadsheetId, action)
    return null
  }
}
