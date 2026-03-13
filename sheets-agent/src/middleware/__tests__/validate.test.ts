import { describe, expect, it, vi, beforeEach } from "vitest"
import type { Request, Response, NextFunction } from "express"

import {
  validateWalletAddress,
  validateToken,
  validateAmount,
  validateRequired,
  validateMaxLength,
  validateBytes32,
  validatePair,
} from "../validate"

// ---------------------------------------------------------------------------
// Helpers to create mock Express objects
// ---------------------------------------------------------------------------

function mockRequest(overrides: {
  query?: Record<string, string>
  body?: Record<string, unknown>
} = {}): Request {
  return {
    query: overrides.query ?? {},
    body: overrides.body ?? {},
  } as unknown as Request
}

function mockResponse(): Response & {
  _status: number | null
  _json: unknown
} {
  const res = {
    _status: null as number | null,
    _json: null as unknown,
    status(code: number) {
      res._status = code
      return res
    },
    json(data: unknown) {
      res._json = data
      return res
    },
  }
  return res as unknown as Response & { _status: number | null; _json: unknown }
}

function mockNext(): NextFunction & { called: boolean } {
  const fn = (() => {
    fn.called = true
  }) as NextFunction & { called: boolean }
  fn.called = false
  return fn
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateWalletAddress", () => {
  const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678"

  describe("with query source (default)", () => {
    it("calls next() for a valid wallet address", () => {
      const req = mockRequest({ query: { wallet: VALID_ADDRESS } })
      const res = mockResponse()
      const next = mockNext()

      validateWalletAddress("wallet")(req, res, next)

      expect(next.called).toBe(true)
      expect(res._status).toBeNull()
    })

    it("returns 400 when wallet address is missing from query", () => {
      // When req.query[field] is undefined, String(undefined) = "undefined"
      // which is non-empty but fails the regex => "Invalid wallet address format"
      const req = mockRequest({ query: {} })
      const res = mockResponse()
      const next = mockNext()

      validateWalletAddress("wallet")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
      expect(res._json).toEqual(
        expect.objectContaining({ error: expect.stringContaining("Invalid wallet address format") })
      )
    })

    it("returns 400 when wallet address is an empty string", () => {
      const req = mockRequest({ query: { wallet: "" } })
      const res = mockResponse()
      const next = mockNext()

      validateWalletAddress("wallet")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("returns 400 for invalid wallet format (too short)", () => {
      const req = mockRequest({ query: { wallet: "0x1234" } })
      const res = mockResponse()
      const next = mockNext()

      validateWalletAddress("wallet")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
      expect(res._json).toEqual(
        expect.objectContaining({ error: expect.stringContaining("Invalid wallet address format") })
      )
    })

    it("returns 400 for invalid wallet format (no 0x prefix)", () => {
      const req = mockRequest({ query: { wallet: "1234567890abcdef1234567890abcdef12345678" } })
      const res = mockResponse()
      const next = mockNext()

      validateWalletAddress("wallet")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("returns 400 for invalid wallet format (non-hex characters)", () => {
      const req = mockRequest({ query: { wallet: "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ" } })
      const res = mockResponse()
      const next = mockNext()

      validateWalletAddress("wallet")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("accepts addresses with mixed-case hex (checksummed)", () => {
      const req = mockRequest({ query: { wallet: "0xAbCdEf0123456789AbCdEf0123456789aBcDeF01" } })
      const res = mockResponse()
      const next = mockNext()

      validateWalletAddress("wallet")(req, res, next)

      expect(next.called).toBe(true)
    })
  })

  describe("with body source", () => {
    it("calls next() for a valid wallet address in body", () => {
      const req = mockRequest({ body: { wallet: VALID_ADDRESS } })
      const res = mockResponse()
      const next = mockNext()

      validateWalletAddress("wallet", "body")(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 when wallet address is missing from body", () => {
      const req = mockRequest({ body: {} })
      const res = mockResponse()
      const next = mockNext()

      validateWalletAddress("wallet", "body")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })
  })
})

describe("validateToken", () => {
  const SUPPORTED = ["USDC", "WETH", "LINK"]

  describe("with query source (default)", () => {
    it("calls next() for a supported token", () => {
      const req = mockRequest({ query: { token: "USDC" } })
      const res = mockResponse()
      const next = mockNext()

      validateToken("token", SUPPORTED)(req, res, next)

      expect(next.called).toBe(true)
    })

    it("calls next() for a supported token in lowercase (uppercased internally)", () => {
      const req = mockRequest({ query: { token: "usdc" } })
      const res = mockResponse()
      const next = mockNext()

      validateToken("token", SUPPORTED)(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 for an unsupported token", () => {
      const req = mockRequest({ query: { token: "DOGE" } })
      const res = mockResponse()
      const next = mockNext()

      validateToken("token", SUPPORTED)(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
      expect(res._json).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("Unsupported token"),
          supported: SUPPORTED,
        })
      )
    })

    it("returns 400 when token is missing from query", () => {
      // When req.query[field] is undefined, String(undefined).toUpperCase() = "UNDEFINED"
      // which is non-empty but not in the supported list => "Unsupported token"
      const req = mockRequest({ query: {} })
      const res = mockResponse()
      const next = mockNext()

      validateToken("token", SUPPORTED)(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
      expect(res._json).toEqual(
        expect.objectContaining({
          error: expect.stringContaining("Unsupported token"),
        })
      )
    })

    it("returns 400 when token is an empty string", () => {
      const req = mockRequest({ query: { token: "" } })
      const res = mockResponse()
      const next = mockNext()

      validateToken("token", SUPPORTED)(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })
  })

  describe("with body source", () => {
    it("calls next() for a supported token in body", () => {
      const req = mockRequest({ body: { token: "WETH" } })
      const res = mockResponse()
      const next = mockNext()

      validateToken("token", SUPPORTED, "body")(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 for unsupported token in body", () => {
      const req = mockRequest({ body: { token: "SHIB" } })
      const res = mockResponse()
      const next = mockNext()

      validateToken("token", SUPPORTED, "body")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })
  })
})

describe("validateAmount", () => {
  describe("with body source (default)", () => {
    it("calls next() for a valid positive amount", () => {
      const req = mockRequest({ body: { amount: 100 } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount")(req, res, next)

      expect(next.called).toBe(true)
    })

    it("calls next() for a small positive decimal", () => {
      const req = mockRequest({ body: { amount: 0.001 } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount")(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 for a negative amount", () => {
      const req = mockRequest({ body: { amount: -5 } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
      expect(res._json).toEqual(
        expect.objectContaining({ error: expect.stringContaining("positive number") })
      )
    })

    it("returns 400 for zero", () => {
      const req = mockRequest({ body: { amount: 0 } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("returns 400 when amount is missing", () => {
      const req = mockRequest({ body: {} })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("returns 400 for non-numeric string", () => {
      const req = mockRequest({ body: { amount: "abc" } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("returns 400 for NaN", () => {
      const req = mockRequest({ body: { amount: NaN } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("returns 400 for Infinity", () => {
      const req = mockRequest({ body: { amount: Infinity } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("accepts a numeric string that parses to a positive number", () => {
      const req = mockRequest({ body: { amount: "42.5" } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount")(req, res, next)

      expect(next.called).toBe(true)
    })
  })

  describe("with query source", () => {
    it("calls next() for a valid amount in query", () => {
      const req = mockRequest({ query: { amount: "100" } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount", "query")(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 for negative amount in query", () => {
      const req = mockRequest({ query: { amount: "-10" } })
      const res = mockResponse()
      const next = mockNext()

      validateAmount("amount", "query")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })
  })
})

describe("validateRequired", () => {
  describe("with body source (default)", () => {
    it("calls next() when a non-empty value is present", () => {
      const req = mockRequest({ body: { name: "Alice" } })
      const res = mockResponse()
      const next = mockNext()

      validateRequired("name")(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 when the field is missing", () => {
      const req = mockRequest({ body: {} })
      const res = mockResponse()
      const next = mockNext()

      validateRequired("name")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
      expect(res._json).toEqual(
        expect.objectContaining({ error: expect.stringContaining("Missing required") })
      )
    })

    it("returns 400 when the field is an empty string", () => {
      const req = mockRequest({ body: { name: "" } })
      const res = mockResponse()
      const next = mockNext()

      validateRequired("name")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("returns 400 when the field is whitespace-only", () => {
      const req = mockRequest({ body: { name: "   " } })
      const res = mockResponse()
      const next = mockNext()

      validateRequired("name")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("calls next() for a numeric value (truthy)", () => {
      const req = mockRequest({ body: { count: 42 } })
      const res = mockResponse()
      const next = mockNext()

      validateRequired("count")(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 for null value", () => {
      const req = mockRequest({ body: { name: null } })
      const res = mockResponse()
      const next = mockNext()

      validateRequired("name")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })

    it("returns 400 for undefined value", () => {
      const req = mockRequest({ body: { name: undefined } })
      const res = mockResponse()
      const next = mockNext()

      validateRequired("name")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })
  })

  describe("with query source", () => {
    it("calls next() when value is present in query", () => {
      const req = mockRequest({ query: { search: "eth" } })
      const res = mockResponse()
      const next = mockNext()

      validateRequired("search", "query")(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 when value is missing from query", () => {
      const req = mockRequest({ query: {} })
      const res = mockResponse()
      const next = mockNext()

      validateRequired("search", "query")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })
  })
})

describe("validateMaxLength", () => {
  describe("with body source (default)", () => {
    it("calls next() when value is within max length", () => {
      const req = mockRequest({ body: { message: "Hello" } })
      const res = mockResponse()
      const next = mockNext()

      validateMaxLength("message", 10)(req, res, next)

      expect(next.called).toBe(true)
    })

    it("calls next() when value is exactly at max length", () => {
      const req = mockRequest({ body: { message: "12345" } })
      const res = mockResponse()
      const next = mockNext()

      validateMaxLength("message", 5)(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 when value exceeds max length", () => {
      const req = mockRequest({ body: { message: "This is a very long message" } })
      const res = mockResponse()
      const next = mockNext()

      validateMaxLength("message", 10)(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
      expect(res._json).toEqual(
        expect.objectContaining({ error: expect.stringContaining("exceeds maximum length") })
      )
    })

    it("includes the max length in the error message", () => {
      const req = mockRequest({ body: { message: "toolong" } })
      const res = mockResponse()
      const next = mockNext()

      validateMaxLength("message", 3)(req, res, next)

      expect(res._json).toEqual(
        expect.objectContaining({ error: expect.stringContaining("3") })
      )
    })

    it("calls next() when value is missing (empty string coercion is short)", () => {
      const req = mockRequest({ body: {} })
      const res = mockResponse()
      const next = mockNext()

      validateMaxLength("message", 10)(req, res, next)

      // String(undefined || "") -> "" which has length 0, under limit
      expect(next.called).toBe(true)
    })
  })

  describe("with query source", () => {
    it("calls next() when query value is within max length", () => {
      const req = mockRequest({ query: { q: "short" } })
      const res = mockResponse()
      const next = mockNext()

      validateMaxLength("q", 100, "query")(req, res, next)

      expect(next.called).toBe(true)
    })

    it("returns 400 when query value exceeds max length", () => {
      const req = mockRequest({ query: { q: "a".repeat(101) } })
      const res = mockResponse()
      const next = mockNext()

      validateMaxLength("q", 100, "query")(req, res, next)

      expect(next.called).toBe(false)
      expect(res._status).toBe(400)
    })
  })
})

describe("validatePair", () => {
  const SUPPORTED = ["ETH/USD", "BTC/USD", "LINK/USD"]

  it("calls next() for a supported pair", () => {
    const req = mockRequest({ query: { pair: "ETH/USD" } })
    const res = mockResponse()
    const next = mockNext()

    validatePair("pair", SUPPORTED)(req, res, next)

    expect(next.called).toBe(true)
  })

  it("uppercases input and matches supported pair", () => {
    const req = mockRequest({ query: { pair: "eth/usd" } })
    const res = mockResponse()
    const next = mockNext()

    validatePair("pair", SUPPORTED)(req, res, next)

    expect(next.called).toBe(true)
  })

  it("returns 400 for unsupported pair", () => {
    const req = mockRequest({ query: { pair: "DOGE/USD" } })
    const res = mockResponse()
    const next = mockNext()

    validatePair("pair", SUPPORTED)(req, res, next)

    expect(next.called).toBe(false)
    expect(res._status).toBe(400)
    expect(res._json).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("Unsupported pair"),
        supported: SUPPORTED,
      })
    )
  })

  it("returns 400 when pair is missing", () => {
    const req = mockRequest({ query: {} })
    const res = mockResponse()
    const next = mockNext()

    validatePair("pair", SUPPORTED)(req, res, next)

    expect(next.called).toBe(false)
    expect(res._status).toBe(400)
  })
})

describe("validateBytes32", () => {
  const VALID_BYTES32 = "0x" + "ab".repeat(32)

  it("calls next() for a valid bytes32 hex string", () => {
    const req = mockRequest({ query: { hash: VALID_BYTES32 } })
    const res = mockResponse()
    const next = mockNext()

    validateBytes32("hash")(req, res, next)

    expect(next.called).toBe(true)
  })

  it("returns 400 for missing value", () => {
    const req = mockRequest({ query: {} })
    const res = mockResponse()
    const next = mockNext()

    validateBytes32("hash")(req, res, next)

    expect(next.called).toBe(false)
    expect(res._status).toBe(400)
    expect(res._json).toEqual(
      expect.objectContaining({ error: expect.stringContaining("bytes32") })
    )
  })

  it("returns 400 for too-short hex", () => {
    const req = mockRequest({ query: { hash: "0xabcd" } })
    const res = mockResponse()
    const next = mockNext()

    validateBytes32("hash")(req, res, next)

    expect(next.called).toBe(false)
    expect(res._status).toBe(400)
  })

  it("returns 400 for missing 0x prefix", () => {
    const req = mockRequest({ query: { hash: "ab".repeat(32) } })
    const res = mockResponse()
    const next = mockNext()

    validateBytes32("hash")(req, res, next)

    expect(next.called).toBe(false)
    expect(res._status).toBe(400)
  })
})
