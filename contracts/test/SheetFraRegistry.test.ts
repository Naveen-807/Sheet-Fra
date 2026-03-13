import { expect } from "chai"
import { ethers } from "hardhat"

describe("SheetFraRegistry", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners()
    const Registry = await ethers.getContractFactory("SheetFraRegistry")
    const registry = await Registry.deploy()
    return { registry, owner, user1, user2 }
  }

  describe("linkSheet", function () {
    it("should link a sheet to the caller's wallet", async function () {
      const { registry, user1 } = await deployFixture()
      const sheetHash = ethers.keccak256(ethers.toUtf8Bytes("spreadsheet-id-123"))

      await expect(registry.connect(user1).linkSheet(sheetHash))
        .to.emit(registry, "SheetLinked")
        .withArgs(sheetHash, user1.address, await getBlockTimestamp())

      const link = await registry.getLink(sheetHash)
      expect(link.wallet).to.equal(user1.address)
      expect(link.active).to.be.true
    })

    it("should reject zero hash", async function () {
      const { registry, user1 } = await deployFixture()
      await expect(
        registry.connect(user1).linkSheet(ethers.ZeroHash)
      ).to.be.revertedWith("Invalid sheet hash")
    })

    it("should reject duplicate links", async function () {
      const { registry, user1 } = await deployFixture()
      const sheetHash = ethers.keccak256(ethers.toUtf8Bytes("spreadsheet-id-123"))
      await registry.connect(user1).linkSheet(sheetHash)
      await expect(
        registry.connect(user1).linkSheet(sheetHash)
      ).to.be.revertedWith("Sheet already linked")
    })
  })

  describe("unlinkSheet", function () {
    it("should unlink a sheet", async function () {
      const { registry, user1 } = await deployFixture()
      const sheetHash = ethers.keccak256(ethers.toUtf8Bytes("spreadsheet-id-456"))

      await registry.connect(user1).linkSheet(sheetHash)
      await registry.connect(user1).unlinkSheet(sheetHash)

      const link = await registry.getLink(sheetHash)
      expect(link.active).to.be.false
    })

    it("should reject unlink from non-owner", async function () {
      const { registry, user1, user2 } = await deployFixture()
      const sheetHash = ethers.keccak256(ethers.toUtf8Bytes("spreadsheet-id-789"))

      await registry.connect(user1).linkSheet(sheetHash)
      await expect(
        registry.connect(user2).unlinkSheet(sheetHash)
      ).to.be.revertedWith("Not the sheet owner")
    })
  })

  describe("getWalletSheets", function () {
    it("should return all sheets for a wallet", async function () {
      const { registry, user1 } = await deployFixture()
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("sheet-a"))
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("sheet-b"))

      await registry.connect(user1).linkSheet(hash1)
      await registry.connect(user1).linkSheet(hash2)

      const sheets = await registry.getWalletSheets(user1.address)
      expect(sheets).to.have.lengthOf(2)
    })
  })

  describe("pause/unpause", function () {
    it("should prevent linking when paused", async function () {
      const { registry, owner, user1 } = await deployFixture()
      const sheetHash = ethers.keccak256(ethers.toUtf8Bytes("paused-test"))

      await registry.connect(owner).pause()
      await expect(
        registry.connect(user1).linkSheet(sheetHash)
      ).to.be.revertedWithCustomError(registry, "EnforcedPause")

      await registry.connect(owner).unpause()
      await registry.connect(user1).linkSheet(sheetHash)
      expect(await registry.isLinked(sheetHash)).to.be.true
    })
  })
})

async function getBlockTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest")
  return block!.timestamp
}
