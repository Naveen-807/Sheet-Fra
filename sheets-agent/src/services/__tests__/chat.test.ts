import { describe, expect, it, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../cre", () => ({
  triggerCREWorkflow: vi.fn(),
}))

vi.mock("../creClient", () => ({
  creRead: vi.fn(),
}))

vi.mock("../sheets", () => ({
  readChatHistory: vi.fn(),
  appendAgentLog: vi.fn(),
  setChatThinking: vi.fn(),
}))

vi.mock("../../utils/errors", () => ({
  getErrorMessage: vi.fn((err: unknown) => {
    if (err instanceof Error) return err.message
    if (typeof err === "string") return err
    return "Unknown error"
  }),
}))

import { processChatMessage, type ChatResponse } from "../chat"
import { triggerCREWorkflow } from "../cre"
import { creRead } from "../creClient"
import { readChatHistory, appendAgentLog, setChatThinking } from "../sheets"

// Typed mock helpers
const mockTriggerCREWorkflow = vi.mocked(triggerCREWorkflow)
const mockCreRead = vi.mocked(creRead)
const mockReadChatHistory = vi.mocked(readChatHistory)
const mockAppendAgentLog = vi.mocked(appendAgentLog)
const mockSetChatThinking = vi.mocked(setChatThinking)

const SHEET_ID = "test-sheet-id-123"

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processChatMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default stubs so tests don't throw on fire-and-forget calls
    mockAppendAgentLog.mockResolvedValue(undefined)
    mockSetChatThinking.mockResolvedValue(undefined)
    // Set wallet address for slash commands that need it
    process.env.WALLET_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"
    // Default creRead mock returns plausible data
    mockCreRead.mockResolvedValue({
      balance: 100.5,
      decimals: 6,
      raw: "100500000",
      price: 3456.78,
      gasGwei: 12,
      tokens: [
        { symbol: "USDC", balance: 100, price: 1, valueUsd: 100 },
        { symbol: "WETH", balance: 0.05, price: 3000, valueUsd: 150 },
      ],
      totalValueUsd: 250,
    })
  })

  // =======================================================================
  // Slash command: /help
  // =======================================================================
  describe("/help command", () => {
    it("returns the list of available commands", async () => {
      const result = await processChatMessage("/help", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.role).toBe("Agent")
      expect(result.response).toContain("Available commands:")
      expect(result.response).toContain("/balance")
      expect(result.response).toContain("/price")
      expect(result.response).toContain("/gas")
      expect(result.response).toContain("/portfolio")
      expect(result.response).toContain("/help")
    })

    it("also responds to /commands alias", async () => {
      const result = await processChatMessage("/commands", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("Available commands:")
    })

    it("handles leading/trailing whitespace", async () => {
      const result = await processChatMessage("  /help  ", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("Available commands:")
    })

    it("logs the command to agent logs", async () => {
      await processChatMessage("/help", SHEET_ID)

      // appendAgentLog is called fire-and-forget (.catch(() => {}))
      // so we just verify it was called
      expect(mockAppendAgentLog).toHaveBeenCalledWith(
        SHEET_ID,
        "chat_command",
        expect.stringContaining("/help"),
        undefined,
      )
    })

    it("does not trigger CRE workflow for slash commands", async () => {
      await processChatMessage("/help", SHEET_ID)

      expect(mockTriggerCREWorkflow).not.toHaveBeenCalled()
    })

    it("does not show the thinking indicator for slash commands", async () => {
      await processChatMessage("/help", SHEET_ID)

      expect(mockSetChatThinking).not.toHaveBeenCalled()
    })
  })

  // =======================================================================
  // Slash command: /balance <token>
  // =======================================================================
  describe("/balance command", () => {
    it("returns a balance message for USDC", async () => {
      const result = await processChatMessage("/balance USDC", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("USDC")
      expect(result.response).toContain("balance")
    })

    it("uppercases the token symbol", async () => {
      const result = await processChatMessage("/balance eth", SHEET_ID)

      expect(result.response).toContain("ETH")
    })

    it("handles a token symbol with extra whitespace", async () => {
      const result = await processChatMessage("/balance   link  ", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("LINK")
    })
  })

  // =======================================================================
  // Slash command: /price <pair>
  // =======================================================================
  describe("/price command", () => {
    it("returns a price message for ETH/USD pair", async () => {
      const result = await processChatMessage("/price ETH/USD", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("ETH/USD")
    })

    it("appends /USD when no slash in pair", async () => {
      const result = await processChatMessage("/price ETH", SHEET_ID)

      expect(result.response).toContain("ETH/USD")
    })

    it("preserves explicit pair with slash", async () => {
      const result = await processChatMessage("/price BTC/ETH", SHEET_ID)

      expect(result.response).toContain("BTC/ETH")
    })

    it("uppercases the pair", async () => {
      const result = await processChatMessage("/price eth/usd", SHEET_ID)

      expect(result.response).toContain("ETH/USD")
    })
  })

  // =======================================================================
  // Slash command: /gas
  // =======================================================================
  describe("/gas command", () => {
    it("returns gas price information", async () => {
      const result = await processChatMessage("/gas", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("gas")
    })
  })

  // =======================================================================
  // Slash command: /portfolio
  // =======================================================================
  describe("/portfolio command", () => {
    it("returns portfolio summary information", async () => {
      const result = await processChatMessage("/portfolio", SHEET_ID)

      expect(result.source).toBe("slash-command")
      expect(result.response).toContain("Portfolio")
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
      "/balance USDC",
      "/price ETH/USD",
    ])("'%s' returns role=Agent and an ISO timestamp", async (cmd) => {
      const result = await processChatMessage(cmd, SHEET_ID)

      expect(result.role).toBe("Agent")
      expect(result.source).toBe("slash-command")
      // Timestamp should be a valid ISO string
      expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false)
    })
  })

  // =======================================================================
  // AI processing (non-slash messages)
  // =======================================================================
  describe("AI message processing", () => {
    it("triggers CRE workflow with chat history context", async () => {
      const historyRows = [
        { role: "User", message: "Hello" },
        { role: "Agent", message: "Hi there!" },
      ]
      mockReadChatHistory.mockResolvedValue(historyRows)
      mockTriggerCREWorkflow.mockResolvedValue({
        success: true,
        output: "AI response about trading",
        mode: "simulation",
      })

      const result = await processChatMessage("What is my balance?", SHEET_ID)

      expect(result.source).toBe("ai")
      expect(result.role).toBe("Agent")
      expect(result.response).toBe("AI response about trading")

      // Verify CRE was called with the right workflow
      expect(mockTriggerCREWorkflow).toHaveBeenCalledWith(
        "ai-trade-executor",
        expect.objectContaining({ command: expect.any(String) }),
      )

      // The command should include the chat history
      const callArgs = mockTriggerCREWorkflow.mock.calls[0][1]
      expect(callArgs.command).toContain("User: Hello")
      expect(callArgs.command).toContain("Agent: Hi there!")
      expect(callArgs.command).toContain("What is my balance?")
    })

    it("includes the system prompt in the CRE command", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: true,
        output: "Some AI response",
        mode: "simulation",
      })

      await processChatMessage("Tell me about ETH", SHEET_ID)

      const callArgs = mockTriggerCREWorkflow.mock.calls[0][1]
      expect(callArgs.command).toContain("WalletSheets")
      expect(callArgs.command).toContain("DeFi trading assistant")
    })

    it("does not show the thinking indicator for AI messages", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: true,
        output: "response",
        mode: "simulation",
      })

      await processChatMessage("Hello there", SHEET_ID)

      expect(mockSetChatThinking).not.toHaveBeenCalled()
    })

    it("reads chat history with limit of 50", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: true,
        output: "response",
        mode: "simulation",
      })

      await processChatMessage("What's the gas price?", SHEET_ID)

      expect(mockReadChatHistory).toHaveBeenCalledWith(SHEET_ID, 50)
    })

    it("returns error response when CRE workflow fails (success=false)", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: false,
        output: "",
        error: "CRE service unavailable",
        mode: "simulation",
      })

      const result = await processChatMessage("Buy 1 ETH", SHEET_ID)

      expect(result.source).toBe("error")
      expect(result.role).toBe("Agent")
      expect(result.response).toContain("trouble connecting")
    })

    it("returns error response when CRE output is empty", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: true,
        output: "",
        mode: "simulation",
      })

      const result = await processChatMessage("Tell me a joke", SHEET_ID)

      expect(result.source).toBe("error")
      expect(result.response).toContain("trouble connecting")
    })

    it("logs the AI response to agent logs", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: true,
        output: "Great question about trading!",
        mode: "simulation",
      })

      await processChatMessage("Explain DeFi to me", SHEET_ID)

      expect(mockAppendAgentLog).toHaveBeenCalledWith(
        SHEET_ID,
        "chat_response",
        expect.stringContaining("Explain DeFi"),
        undefined,
      )
    })

    it("does not log to agent logs when CRE fails", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: false,
        output: "",
        error: "Timeout",
        mode: "simulation",
      })

      await processChatMessage("Buy ETH", SHEET_ID)

      // appendAgentLog should NOT be called for the "chat_response" action
      // (it may be called for other things, but not for the response)
      const chatResponseCalls = mockAppendAgentLog.mock.calls.filter(
        (args) => args[1] === "chat_response"
      )
      expect(chatResponseCalls).toHaveLength(0)
    })

    it("builds prompt without history prefix when history is empty", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: true,
        output: "Hello!",
        mode: "simulation",
      })

      await processChatMessage("Hi", SHEET_ID)

      const callArgs = mockTriggerCREWorkflow.mock.calls[0][1]
      expect(callArgs.command).not.toContain("Chat history:")
      expect(callArgs.command).toContain("User: Hi")
    })

    it("builds prompt with history prefix when history exists", async () => {
      mockReadChatHistory.mockResolvedValue([
        { role: "User", message: "First message" },
      ])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: true,
        output: "Got it!",
        mode: "simulation",
      })

      await processChatMessage("Second message", SHEET_ID)

      const callArgs = mockTriggerCREWorkflow.mock.calls[0][1]
      expect(callArgs.command).toContain("Chat history:")
      expect(callArgs.command).toContain("User: First message")
      expect(callArgs.command).toContain("User: Second message")
    })
  })

  // =======================================================================
  // ChatResponse shape validation
  // =======================================================================
  describe("response shape", () => {
    it("always returns a valid ChatResponse object", async () => {
      mockReadChatHistory.mockResolvedValue([])
      mockTriggerCREWorkflow.mockResolvedValue({
        success: true,
        output: "test output",
        mode: "simulation",
      })

      const result: ChatResponse = await processChatMessage("test", SHEET_ID)

      expect(result).toHaveProperty("response")
      expect(result).toHaveProperty("role")
      expect(result).toHaveProperty("timestamp")
      expect(result).toHaveProperty("source")
      expect(typeof result.response).toBe("string")
      expect(typeof result.role).toBe("string")
      expect(typeof result.timestamp).toBe("string")
      expect(["slash-command", "ai", "error"]).toContain(result.source)
    })
  })
})
