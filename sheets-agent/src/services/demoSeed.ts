/**
 * Judge-mode demo data seeder.
 *
 * When JUDGE_MODE=true, populates the sheet with realistic sample data
 * so judges see a working, populated spreadsheet during demo.
 */

import { createLogger } from "../utils/logger"
import { getSheetsClient } from "./sheets"

const log = createLogger("demo-seed")

/**
 * Seed demo data into all visible tabs for judge presentation.
 * Only runs when JUDGE_MODE=true.
 */
export async function seedDemoData(spreadsheetId: string): Promise<void> {
  if (process.env.JUDGE_MODE !== "true") return

  log.info("Judge mode active — seeding demo data")

  try {
    const sheets = await getSheetsClient()

    // Seed View Transactions tab with realistic portfolio
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'View Transactions'!A1:H8",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          ["TOKEN", "BALANCE", "PRICE (USD)", "VALUE (USD)", "ALLOCATION %", "24H CHANGE", "CHAIN", "SOURCE"],
          ["DOT", "450.00", "$7.25", "$3,262.50", "40.8%", "+2.4%", "Polkadot Hub", "On-chain"],
          ["USDT", "3,200.00", "$1.00", "$3,200.00", "40.0%", "0.0%", "Polkadot Hub", "On-chain"],
          ["WETH", "0.52", "$2,950.00", "$1,534.00", "19.2%", "+1.8%", "Polkadot Hub (Snowbridge)", "On-chain"],
          [],
          ["TOTAL PORTFOLIO", "", "", "$7,996.50", "100%", "", "", ""],
          ["Last Updated", new Date().toISOString(), "", "", "", "", "", ""],
          ["Network", "Polkadot Hub Testnet (Chain 420420417)", "", "", "", "", "", ""],
        ],
      },
    })

    // Seed Stablecoin Reserve tab
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Stablecoin Reserve'!A2:E5",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          ["USDT Balance", "$3,200.00", "—", "Active", new Date().toISOString().split("T")[0]],
          ["Stablecoin % of Portfolio", "40.0%", "40%", "ON TARGET", "—"],
          ["Minimum Reserve", "$3,200.00", "$500", "HEALTHY", "—"],
          ["Reserve Health", "HEALTHY", "HEALTHY", "Above minimum by $2,700", "—"],
        ],
      },
    })

    // Seed XCM / Cross-Chain tab status
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'XCM / Cross-Chain'!B3",
      valueInputOption: "RAW",
      requestBody: {
        values: [["Active — Connected to Polkadot Hub Testnet"]],
      },
    })

    // Seed Chat History with a demo conversation
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Chat with Wallet'!A5:B12",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          ["Agent", "Welcome to SheetFra! I'm your AI DeFi assistant for Polkadot Hub. Try asking about your portfolio, or say 'swap 10 USDT for DOT'. [Gemini AI]"],
          ["You", "What's my portfolio?"],
          ["Agent", "Your portfolio on Polkadot Hub is worth $7,996.50: 450 DOT ($3,262.50, 40.8%), 3,200 USDT ($3,200.00, 40.0%), and 0.52 WETH ($1,534.00, 19.2%). Your stablecoin reserve is healthy at 40% — right on target. [Gemini AI]"],
          ["You", "swap 10 USDT for DOT"],
          ["Agent", "I'll stage a swap of 10 USDT for DOT on Hydration Omnipool. At current price ($7.25/DOT), you'd receive approximately 1.38 DOT.\n\nStaged as a Pending Trade. Approve it from the Pending Trades tab to execute. Action logged to SheetFraRegistry audit trail. [Gemini AI]"],
          ["You", "/reserve"],
          ["Agent", "Stablecoin Reserve Status:\n  Minimum Reserve Target: $500\n  Allowed Stablecoins: USDT (primary on Polkadot Hub)\n  Current Reserve: $3,200 (40.0% of portfolio)\n  Status: HEALTHY — above minimum by $2,700"],
          ["You", "/xcm"],
        ],
      },
    })

    // Seed a sample pending trade
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Pending Trades'!A2:I2",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          new Date().toISOString(),
          "USDT",
          "DOT",
          "10",
          "50",
          "PENDING",
          "",
          "",
          "[AI] swap 10 USDT for DOT",
        ]],
      },
    })

    // Seed Agent Logs with registry action
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Agent Logs'!A2:E4",
      valueInputOption: "RAW",
      requestBody: {
        values: [
          ["chat_response", "Gemini direct: \"What's my portfolio?\"", "", new Date().toISOString(), "OK"],
          ["chat_response", "Gemini direct: \"swap 10 USDT for DOT\"", "", new Date().toISOString(), "OK"],
          ["registry_action", "Swap 10 USDT → DOT | sheetHash: 0x3a7f2b1c9e... | actionHash: 0x8d4e6f0a2b...", "", new Date().toISOString(), "OK"],
        ],
      },
    })

    log.info("Demo data seeded successfully")
  } catch (err) {
    log.warn("Demo data seeding failed (non-critical)", { error: (err as Error).message })
  }
}
