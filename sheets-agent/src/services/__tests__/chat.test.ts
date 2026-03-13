import { describe, expect, it, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../gemini", () => ({
  chatWithGemini: vi.fn(),
  isGeminiAvailable: vi.fn(),
}))

vi.mock("../sheets", () => ({
  readChatHistory: vi.fn(),
  appendAgentLog: vi.fn(),
  readRiskRules: vi.fn(),
  stagePendingTrade: vi.fn(),
}))

vi.mock("../../utils/errors", () => ({
  getErrorMessage: vi.fn((err: unknown) => {
    if (err instanceof Error) return err.message
    if (typeof err === "string") return err
    return "Unknown error"
  }),
}))

vi.mock("../../config/polkadot-hub", () => ({
  POLKADOT_HUB_TESTNET: {
    chainId: 420420417,
    name: "Polkadot Hub Testnet",
    rpcUrl: "https://testnet-passet-hub-eth-rpc.polkadot.io",
    blockExplorer: "https://polkadot-hub-testnet.blockscout.com",
    nativeCurrency: { name: "PAS", symbol: "PAS", decimals: 10 },
  },
}))

import { processChatMessage, type ChatResponse } from "../chat"
import { chatWithGemini, isGeminiAvailable } from "../gemini"
import { readChatHistory, appendAgentLog, readRiskRules, stagePendingTrade } from "../sheets"

// Typed mock helpers
const mockChatWithGemini = vi.mocked(chatWithGemini)
const mockIsGeminiAvailable = vi.mocked(isGeminiAvailable)
const mockReadChatHistory = vi.mocked(readChatHistory)
const mockAppendAgentLog = vi.mocked(appendAgentLog)
const mockReadRiskRules = vi.mocked(readRiskRules)
const mockStagePendingTrade = vi.mocked(stagePendingTrade)

const SHEET_ID = "test-sheet-id-123"

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processChatMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default stubs
    mockAppendAgentLog.mockResolvedValue(undefined)
    mockIsGeminiAvailable.mockReturnValue(true)
    mockReadRiskRules.mockResolvedValue({
      maxSlippageBps: 200,
      allowedAssets: ["DOT", "USDT", "WETH"],
      minStableReserveUsd: 500,
      maxSingleAssetPct: 60,
      cooldownMinutes: 5,
      maxDailyVolumeUsd: 10000,
      maxDriftPct: 15,
    })
    mockStagePendingTrade.mockResolvedValue(undefined)
    process.env.WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"
  })

  // =======================================================================
  // Slash command: /help
  // =======================================================================
  describe("/help command", () => {
    it("returns the list of available commands", async () => {
      const result = await processChatMessage("/help", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.role).toBe("Agent")
      expect(result.response).toContain("Available Commands:")
      expect(result.response).toContain("/balance")
      expect(result.response).toContain("/price")
      expect(result.response).toContain("/gas")
      expect(result.response).toContain("/portfolio")
      expect(result.response).toContain("/trade")
    })

    it("includes Polkadot-specific commands", async () => {
      const result = await processChatMessage("/help", SHEET_ID)

      expect(result.response).toContain("/polkadot")
      expect(result.response).toContain("/hub-status")
      expect(result.response).toContain("/dot-price")
    })

    it("also responds to /commands alias", async () => {
      const result = await processChatMessage("/commands", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("Available Commands:")
    })

    it("handles leading/trailing whitespace", async () => {
      const result = await processChatMessage("  /help  ", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("Available Commands:")
    })

    it("logs the command to agent logs", async () => {
      await processChatMessage("/help", SHEET_ID)

      expect(mockAppendAgentLog).toHaveBeenCalledWith(
        SHEET_ID,
        "chat_command",
        expect.stringContaining("/help"),
        undefined,
      )
    })

    it("does not trigger Gemini for slash commands", async () => {
      await processChatMessage("/help", SHEET_ID)

      expect(mockChatWithGemini).not.toHaveBeenCalled()
    })
  })

  // =======================================================================
  // Slash command: /balance <token>
  // =======================================================================
  describe("/balance command", () => {
    it("returns disabled message in sheets-only mode", async () => {
      const result = await processChatMessage("/balance USDT", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("disabled")
    })
  })

  // =======================================================================
  // Slash command: /price <pair>
  // =======================================================================
  describe("/price command", () => {
    it("returns disabled message in sheets-only mode", async () => {
      const result = await processChatMessage("/price DOT/USD", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("disabled")
    })
  })

  // =======================================================================
  // Slash command: /gas
  // =======================================================================
  describe("/gas command", () => {
    it("returns disabled message", async () => {
      const result = await processChatMessage("/gas", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("disabled")
    })
  })

  // =======================================================================
  // Slash command: /portfolio
  // =======================================================================
  describe("/portfolio command", () => {
    it("returns disabled message", async () => {
      const result = await processChatMessage("/portfolio", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("disabled")
    })
  })

  // =======================================================================
  // Slash command: /risk
  // =======================================================================
  describe("/risk command", () => {
    it("returns current risk rules", async () => {
      const result = await processChatMessage("/risk", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("Risk Rules")
      expect(result.response).toContain("200 bps")
      expect(result.response).toContain("DOT")
    })
  })

  // =======================================================================
  // Slash command: /status
  // =======================================================================
  describe("/status command", () => {
    it("returns agent status with Polkadot Hub info", async () => {
      const result = await processChatMessage("/status", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("SheetFra Agent Status")
      expect(result.response).toContain("Polkadot Hub Testnet")
      expect(result.response).toContain("420420417")
    })
  })

  // =======================================================================
  // Slash command: /polkadot
  // =======================================================================
  describe("/polkadot command", () => {
    it("returns Polkadot ecosystem info", async () => {
      const result = await processChatMessage("/polkadot", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("Polkadot Ecosystem")
      expect(result.response).toContain("Hydration")
      expect(result.response).toContain("Bifrost")
      expect(result.response).toContain("Snowbridge")
    })
  })

  // =======================================================================
  // Slash command: /hub-status
  // =======================================================================
  describe("/hub-status command", () => {
    it("returns Polkadot Hub network info", async () => {
      const result = await processChatMessage("/hub-status", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("Polkadot Hub Testnet")
      expect(result.response).toContain("420420417")
      expect(result.response).toContain("polkadot-hub-testnet.blockscout.com")
    })
  })

  // =======================================================================
  // All slash commands share common properties
  // =======================================================================
  describe("slash command common response shape", () => {
    it.each([
      "/help",
      "/commands",
      "/gas",
      "/portfolio",
      "/balance USDT",
      "/price DOT/USD",
      "/risk",
      "/status",
      "/polkadot",
      "/hub-status",
    ])("'%s' returns role=Agent and an ISO timestamp", async (cmd) => {
      const result = await processChatMessage(cmd, SHEET_ID)

      expect(result.role).toBe("Agent")
      expect(result.source).toBe("slash-command")
      expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false)
    })
  })

  // =======================================================================
  // AI processing (non-slash messages)
  // =======================================================================
  describe("AI message processing", () => {
    it("calls Gemini with chat history context", async () => {
      mockReadChatHistory.mockResolvedValue([
        { role: "You", message: "Hello" },
        { role: "Agent", message: "Hi there!" },
      ])
      mockChatWithGemini.mockResolvedValue({
        action: "info",
        response: "AI response about trading",
        isTradeIntent: false,
        confidence: "high",
      })

      const result = await processChatMessage("What is my balance?", SHEET_ID)

      expect(result.source).toBe("gemini-direct")
      expect(result.role).toBe("Agent")
      expect(result.response).toBe("AI response about trading")
      expect(mockChatWithGemini).toHaveBeenCalled()
    })

    it("stages a pending trade when Gemini detects swap intent", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockChatWithGemini.mockResolvedValue({
        action: "swap",
        tokenIn: "USDT",
        tokenOut: "DOT",
        amount: 50,
        response: "I'll swap 50 USDT for DOT for you.",
        isTradeIntent: true,
        confidence: "high",
      })

      const result = await processChatMessage("swap 50 USDT for DOT", SHEET_ID)

      expect(result.source).toBe("gemini-direct")
      expect(result.tradeIntent).toBeDefined()
      expect(result.tradeIntent?.action).toBe("swap")
      expect(result.tradeIntent?.tokenIn).toBe("USDT")
      expect(result.tradeIntent?.tokenOut).toBe("DOT")
      expect(mockStagePendingTrade).toHaveBeenCalledWith(
        SHEET_ID,
        expect.objectContaining({
          tokenIn: "USDT",
          tokenOut: "DOT",
          amount: 50,
        }),
      )
    })

    it("does not stage trade when isTradeIntent is false", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockChatWithGemini.mockResolvedValue({
        action: "portfolio",
        response: "Your portfolio is worth $1000",
        isTradeIntent: false,
        confidence: "high",
      })

      await processChatMessage("Show me my portfolio", SHEET_ID)

      expect(mockStagePendingTrade).not.toHaveBeenCalled()
    })

    it("returns error when Gemini is not available", async () => {
      mockIsGeminiAvailable.mockReturnValue(false)

      const result = await processChatMessage("Hello there", SHEET_ID)

      expect(result.source).toBe("error")
      expect(result.response).toContain("AI service is not configured")
    })

    it("returns error response when Gemini call fails", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockChatWithGemini.mockRejectedValue(new Error("Gemini API error"))

      const result = await processChatMessage("Buy DOT", SHEET_ID)

      expect(result.source).toBe("error")
      expect(result.role).toBe("Agent")
      expect(result.response).toContain("trouble connecting")
    })

    it("logs the AI response to agent logs", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockChatWithGemini.mockResolvedValue({
        action: "info",
        response: "Great question about DeFi!",
        isTradeIntent: false,
        confidence: "high",
      })

      await processChatMessage("Explain DeFi to me", SHEET_ID)

      expect(mockAppendAgentLog).toHaveBeenCalledWith(
        SHEET_ID,
        "chat_response",
        expect.stringContaining("Explain DeFi"),
        undefined,
      )
    })
  })

  // =======================================================================
  // ChatResponse shape validation
  // =======================================================================
  describe("response shape", () => {
    it("always returns a valid ChatResponse object", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockChatWithGemini.mockResolvedValue({
        action: "info",
        response: "test output",
        isTradeIntent: false,
        confidence: "high",
      })

      const result: ChatResponse = await processChatMessage("test", SHEET_ID)

      expect(result).toHaveProperty("response")
      expect(result).toHaveProperty("role")
      expect(result).toHaveProperty("timestamp")
      expect(result).toHaveProperty("source")
      expect(typeof result.response).toBe("string")
      expect(typeof result.role).toBe("string")
      expect(typeof result.timestamp).toBe("string")
      expect(["slash-command", "gemini-direct", "error"]).toContain(result.source)
    })
  })
})
