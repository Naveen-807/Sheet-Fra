/**
 * Blockchain service — real on-chain balance reads via viem.
 *
 * Connects to Polkadot Hub Testnet RPC and reads native + ERC20 balances.
 */

import { createPublicClient, http, formatUnits, type PublicClient, type Address } from "viem"
import { POLKADOT_HUB_TESTNET, POLKADOT_HUB_TOKENS } from "../config/polkadot-hub"
import { createLogger } from "../utils/logger"

const log = createLogger("blockchain")

// Minimal ERC20 ABI for balance reads
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const

// Define the Polkadot Hub chain for viem
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

let client: PublicClient | null = null

export function getPublicClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: polkadotHubChain,
      transport: http(POLKADOT_HUB_TESTNET.rpcUrl, { timeout: 15_000 }),
    }) as PublicClient
  }
  return client
}

/**
 * Get native PAS/DOT balance for an address.
 * Returns raw bigint as string (10 decimals on Polkadot Hub).
 */
export async function getNativeBalance(address: string): Promise<string> {
  const pub = getPublicClient()
  const balance = await pub.getBalance({ address: address as Address })
  log.info("Native balance fetched", { address: address.slice(0, 10) + "...", balance: balance.toString() })
  return balance.toString()
}

/**
 * Get ERC20 token balance for an address.
 * Returns raw bigint as string.
 */
export async function getTokenBalance(address: string, tokenAddress: string): Promise<{ balance: string; decimals: number }> {
  const pub = getPublicClient()
  const [balance, decimals] = await Promise.all([
    pub.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    }),
    pub.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
  ])
  return { balance: (balance as bigint).toString(), decimals: Number(decimals) }
}

export interface TokenBalances {
  DOT: string   // raw native balance (10 decimals)
  USDT: string  // raw ERC20 balance (6 decimals typically)
  WETH: string  // raw ERC20 balance (18 decimals)
}

/**
 * Fetch all token balances for a wallet.
 * Skips tokens without configured addresses.
 */
export async function getTokenBalances(address: string): Promise<TokenBalances> {
  const result: TokenBalances = { DOT: "0", USDT: "0", WETH: "0" }

  // Native balance
  try {
    result.DOT = await getNativeBalance(address)
  } catch (err) {
    log.warn("Failed to fetch native balance", { error: (err as Error).message })
  }

  // USDT
  if (POLKADOT_HUB_TOKENS.USDT) {
    try {
      const { balance } = await getTokenBalance(address, POLKADOT_HUB_TOKENS.USDT)
      result.USDT = balance
    } catch (err) {
      log.warn("Failed to fetch USDT balance", { error: (err as Error).message })
    }
  }

  // WETH
  if (POLKADOT_HUB_TOKENS.WETH) {
    try {
      const { balance } = await getTokenBalance(address, POLKADOT_HUB_TOKENS.WETH)
      result.WETH = balance
    } catch (err) {
      log.warn("Failed to fetch WETH balance", { error: (err as Error).message })
    }
  }

  log.info("All balances fetched", {
    address: address.slice(0, 10) + "...",
    DOT: result.DOT,
    USDT: result.USDT !== "0" ? result.USDT : "(no contract)",
    WETH: result.WETH !== "0" ? result.WETH : "(no contract)",
  })

  return result
}

/**
 * Format a raw balance string with the given decimal places into a human-readable number.
 */
export function formatTokenBalance(raw: string, decimals: number): string {
  if (!raw || raw === "0") return "0"
  return formatUnits(BigInt(raw), decimals)
}

/**
 * Get the block explorer URL for a transaction.
 */
export function getExplorerTxUrl(txHash: string): string {
  return `${POLKADOT_HUB_TESTNET.blockExplorer}/tx/${txHash}`
}

/**
 * Get the block explorer URL for an address.
 */
export function getExplorerAddressUrl(address: string): string {
  return `${POLKADOT_HUB_TESTNET.blockExplorer}/address/${address}`
}
