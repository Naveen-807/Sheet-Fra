/**
 * Polkadot Hub configuration for SheetFra.
 * Use this when pivoting from Sepolia to Polkadot Hub for the hackathon.
 *
 * Docs: https://docs.polkadot.com/develop/smart-contracts/libraries/ethers-js
 * Faucet: https://faucet.polkadot.io/
 */

export const POLKADOT_HUB_TESTNET = {
  chainId: 420420417,
  name: "Polkadot Hub Testnet",
  rpcUrl: process.env.POLKADOT_HUB_RPC_URL ?? "https://testnet-passet-hub-eth-rpc.polkadot.io",
  blockExplorer: "https://polkadot-hub-testnet.blockscout.com",
  nativeCurrency: {
    name: "PAS",
    symbol: "PAS",
    decimals: 10,
  },
} as const;

/**
 * Token addresses on Polkadot Hub — verify against official docs before use.
 * These are placeholders; replace with actual deployed contract addresses.
 */
export const POLKADOT_HUB_TOKENS = {
  // Native: PAS (DOT equivalent on Hub)
  DOT: "native",
  // EVM ERC20 addresses — check Polkadot Hub token list
  USDT: process.env.POLKADOT_HUB_USDT ?? "",
  WETH: process.env.POLKADOT_HUB_WETH ?? "",
} as const;
