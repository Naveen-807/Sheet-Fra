import { ethers } from "hardhat"

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deploying SheetFra contracts with account:", deployer.address)
  const explorer = "https://polkadot-hub-testnet.blockscout.com"

  // 1. SheetFraRegistry (Track 1: EVM + OpenZeppelin)
  const Registry = await ethers.getContractFactory("SheetFraRegistry")
  const registry = await Registry.deploy()
  await registry.waitForDeployment()
  const registryAddr = await registry.getAddress()
  console.log("SheetFraRegistry deployed to:", registryAddr)
  console.log("  Explorer:", `${explorer}/address/${registryAddr}`)

  // 2. SheetFraXcmBridge (Track 2: PVM precompiles)
  const XcmBridge = await ethers.getContractFactory("SheetFraXcmBridge")
  const xcmBridge = await XcmBridge.deploy()
  await xcmBridge.waitForDeployment()
  const xcmBridgeAddr = await xcmBridge.getAddress()
  console.log("SheetFraXcmBridge deployed to:", xcmBridgeAddr)
  console.log("  Explorer:", `${explorer}/address/${xcmBridgeAddr}`)

  console.log("\nDeployment complete. Add to .env:")
  console.log(`SHEETFRA_REGISTRY_ADDRESS=${registryAddr}`)
  console.log(`SHEETFRA_XCM_BRIDGE_ADDRESS=${xcmBridgeAddr}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
