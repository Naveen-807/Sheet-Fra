/**
 * Export endpoints for trade history and portfolio data.
 * Returns CSV format for tax reporting and analysis.
 */

import { Router, Request, Response } from "express"
import { startExecutionRecord, completeExecutionRecord, failExecutionRecord } from "../services/executionLedger"
import { getSheetsClient } from "../services/sheets"
import { rateLimit } from "../middleware/rateLimit"
import { getErrorMessage } from "../utils/errors"
import { sendError } from "../utils/apiResponse"
import { createLogger } from "../utils/logger"
import { maybePrintSheetCommand } from "../utils/banner"
const log = createLogger("exports")
import { getSpreadsheetId } from "./shared"

const router = Router()

function getExecutionRequestId(req: Request): string {
  return String(req.requestId || req.headers["x-request-id"] || `exports-${Date.now().toString(36)}`)
}

function getExecutionCommand(req: Request, fallback: string): string {
  const sheetFormula = req.headers["x-sheet-formula"]
  if (typeof sheetFormula === "string" && sheetFormula.trim()) return sheetFormula.trim()
  const sheetCommand = req.headers["x-sheet-command"]
  if (typeof sheetCommand === "string" && sheetCommand.trim()) return sheetCommand.trim()
  return fallback
}

async function startExportExecution(req: Request, source: string, command: string, parsedAction: string): Promise<string> {
  const requestId = getExecutionRequestId(req)
  const spreadsheetId = getSpreadsheetId()
  if (spreadsheetId) {
    await startExecutionRecord({
      spreadsheetId,
      requestId,
      source,
      command,
      parsedAction,
      workflow: "export",
      status: "QUEUED",
      result: "Preparing sheet export",
    })
  }
  return requestId
}

/**
 * GET /api/export/trades?format=csv&from=&to=
 * Exports trade history from the Trades tab as CSV.
 */
router.get(
  "/api/export/trades",
  rateLimit(5, 60_000),
  async (req: Request, res: Response) => {
    try {
      maybePrintSheetCommand(req)
      const requestId = await startExportExecution(
        req,
        "api/export/trades",
        getExecutionCommand(req, "GET /api/export/trades"),
        "Export trades",
      )
      const spreadsheetId = getSpreadsheetId()
      if (!spreadsheetId) {
        sendError(res, 503, "No spreadsheet configured")
        return
      }

      const format = (req.query.format as string || "csv").toLowerCase()
      const fromDate = req.query.from as string | undefined
      const toDate = req.query.to as string | undefined

      const sheets = await getSheetsClient()
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "'Trades'!A:I",
      })

      const rows = result.data.values || []
      if (rows.length <= 1) {
        sendError(res, 404, "No trade data found")
        return
      }

      const headers = rows[0]
      let dataRows = rows.slice(1)

      // Date filtering
      if (fromDate || toDate) {
        dataRows = dataRows.filter((row) => {
          const timestamp = row[0] as string
          if (!timestamp) return false
          try {
            const date = new Date(timestamp)
            if (fromDate && date < new Date(fromDate)) return false
            if (toDate && date > new Date(toDate)) return false
            return true
          } catch {
            return true
          }
        })
      }

      if (format === "json") {
        const trades = dataRows.map((row) => {
          const obj: Record<string, string> = {}
          headers.forEach((h: string, i: number) => {
            obj[h] = row[i] || ""
          })
          return obj
        })
        await completeExecutionRecord(requestId, {
          source: "api/export/trades",
          status: "COMPLETED",
          parsedAction: "Export trades as JSON",
          workflow: "export/trades",
          result: `Returned ${trades.length} trade row(s) as JSON`,
        })
        res.json({ trades, count: trades.length })
        return
      }

      // CSV format
      const escapeCsv = (val: string) => {
        if (!val) return ""
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return '"' + val.replace(/"/g, '""') + '"'
        }
        return val
      }

      const csvLines = [
        headers.map(escapeCsv).join(","),
        ...dataRows.map((row) =>
          headers.map((_: string, i: number) => escapeCsv(String(row[i] || ""))).join(",")
        ),
      ]

      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="sheetfra-trades-${new Date().toISOString().slice(0, 10)}.csv"`)
      await completeExecutionRecord(requestId, {
        source: "api/export/trades",
        status: "COMPLETED",
        parsedAction: "Export trades as CSV",
        workflow: "export/trades",
        result: `Returned ${dataRows.length} trade row(s) as CSV`,
      })
      res.send(csvLines.join("\n"))
    } catch (error: unknown) {
      log.error("[Export] Trades export error", { error: getErrorMessage(error) })
      await failExecutionRecord(getExecutionRequestId(req), getErrorMessage(error), {
        source: "api/export/trades",
        parsedAction: "Trades export failed",
        workflow: "export/trades",
      })
      sendError(res, 500, "Failed to export trades")
    }
  }
)

/**
 * GET /api/export/portfolio?format=csv
 * Exports current portfolio from the Portfolio tab as CSV.
 */
router.get(
  "/api/export/portfolio",
  rateLimit(10, 60_000),
  async (req: Request, res: Response) => {
    try {
      maybePrintSheetCommand(req)
      const requestId = await startExportExecution(
        req,
        "api/export/portfolio",
        getExecutionCommand(req, "GET /api/export/portfolio"),
        "Export portfolio",
      )
      const spreadsheetId = getSpreadsheetId()
      if (!spreadsheetId) {
        sendError(res, 503, "No spreadsheet configured")
        return
      }

      const format = (req.query.format as string || "csv").toLowerCase()

      const sheets = await getSheetsClient()
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "'Portfolio'!A:E",
      })

      const rows = result.data.values || []
      if (rows.length <= 1) {
        sendError(res, 404, "No portfolio data found")
        return
      }

      const headers = rows[0]
      const dataRows = rows.slice(1).filter((row) => row[0] && !String(row[0]).startsWith("TOTAL") && !String(row[0]).startsWith("Last"))

      if (format === "json") {
        const portfolio = dataRows.map((row) => {
          const obj: Record<string, string> = {}
          headers.forEach((h: string, i: number) => {
            obj[h] = row[i] || ""
          })
          return obj
        })
        await completeExecutionRecord(requestId, {
          source: "api/export/portfolio",
          status: "COMPLETED",
          parsedAction: "Export portfolio as JSON",
          workflow: "export/portfolio",
          result: `Returned ${portfolio.length} portfolio row(s) as JSON`,
        })
        res.json({ portfolio, count: portfolio.length })
        return
      }

      const escapeCsv = (val: string) => {
        if (!val) return ""
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return '"' + val.replace(/"/g, '""') + '"'
        }
        return val
      }

      const csvLines = [
        headers.map(escapeCsv).join(","),
        ...dataRows.map((row) =>
          headers.map((_: string, i: number) => escapeCsv(String(row[i] || ""))).join(",")
        ),
      ]

      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="sheetfra-portfolio-${new Date().toISOString().slice(0, 10)}.csv"`)
      await completeExecutionRecord(requestId, {
        source: "api/export/portfolio",
        status: "COMPLETED",
        parsedAction: "Export portfolio as CSV",
        workflow: "export/portfolio",
        result: `Returned ${dataRows.length} portfolio row(s) as CSV`,
      })
      res.send(csvLines.join("\n"))
    } catch (error: unknown) {
      log.error("[Export] Portfolio export error", { error: getErrorMessage(error) })
      await failExecutionRecord(getExecutionRequestId(req), getErrorMessage(error), {
        source: "api/export/portfolio",
        parsedAction: "Portfolio export failed",
        workflow: "export/portfolio",
      })
      sendError(res, 500, "Failed to export portfolio")
    }
  }
)

export default router
