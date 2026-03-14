import { google, sheets_v4 } from "googleapis"
import fs from "fs"
import path from "path"
import { createLogger } from "../utils/logger"
import { POLKADOT_HUB_TESTNET } from "../config/polkadot-hub"

const log = createLogger("sheets")

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
]

let sheetsClient: sheets_v4.Sheets | null = null

function getAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
  if (!keyFile) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_PATH not set in environment")
  }
  if (!fs.existsSync(keyFile)) {
    throw new Error(`Service account key file not found: ${keyFile}`)
  }
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: SCOPES,
  })
}

export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (sheetsClient) return sheetsClient
  sheetsClient = google.sheets({ version: "v4", auth: getAuth() })
  return sheetsClient
}

/**
 * Retry wrapper with exponential backoff for Google API calls.
 * Retries on 429 (rate limit) and 503 (service unavailable) errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error: unknown) {
      const status = (error as { code?: number })?.code ??
        (error as { response?: { status?: number } })?.response?.status
      const isRetryable = status === 429 || status === 503

      if (!isRetryable || attempt === maxAttempts) {
        throw error
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500
      log.warn("API rate limited or unavailable, retrying", { status, delay: Math.round(delay), attempt, maxAttempts })
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error("withRetry: exhausted all attempts")
}

// =============================================================
// Auto-discover Google Sheets shared with the service account
// =============================================================

/**
 * Uses the Google Drive API to find spreadsheets shared with the service account.
 * Returns the first spreadsheet ID found, or null if none.
 */
export async function discoverSheetId(): Promise<string | null> {
  const drive = google.drive({ version: "v3", auth: getAuth() })

  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id, name)",
    orderBy: "createdTime desc",
    pageSize: 10,
  })

  const files = res.data.files || []
  if (files.length === 0) {
    log.warn("No spreadsheets found shared with the service account")
    return null
  }

  log.info("Found spreadsheets", { count: files.length })
  files.forEach((f) => log.info("Spreadsheet discovered", { name: f.name, id: f.id }))

  // Return the first one
  return files[0].id || null
}

/**
 * Returns ALL spreadsheets currently shared with the service account.
 */
export async function discoverAllSheetIds(): Promise<Array<{ id: string; name: string }>> {
  const drive = google.drive({ version: "v3", auth: getAuth() })
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id, name)",
    orderBy: "createdTime desc",
    pageSize: 20,
  })
  return (res.data.files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({ id: f.id!, name: f.name! }))
}

/**
 * Auto-detect the sheet ID and persist it to the .env file.
 *
 * Strategy:
 *   1. Ask Drive API for sheets shared with the service account (newest first).
 *   2. If the configured GOOGLE_SHEET_ID is still the most-recently-shared one,
 *      keep it (no-op).
 *   3. If there is a NEWER sheet (one not matching the current env ID), switch to
 *      it — update the in-process env var and persist to .env.
 *   4. If no GOOGLE_SHEET_ID is set at all, use the first discovered sheet.
 */
export async function autoConfigureSheetId(): Promise<string> {
  const existing = process.env.GOOGLE_SHEET_ID?.trim()

  let discovered: string | null = null
  try {
    // discoverSheetId returns the most-recently-created sheet first
    discovered = await discoverSheetId()
  } catch (err) {
    log.warn("Drive auto-discovery failed, falling back to configured ID", { error: (err as Error).message })
  }

  // If we found a sheet via Drive and it's different from what's in env, switch
  if (discovered && discovered !== existing) {
    log.info("Auto-discovered a newer sheet — switching", { from: existing || "(none)", to: discovered })

    const envPath = path.resolve(__dirname, "../../.env")
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, "utf-8")
      if (envContent.includes("GOOGLE_SHEET_ID=")) {
        envContent = envContent.replace(/GOOGLE_SHEET_ID=.*/, `GOOGLE_SHEET_ID=${discovered}`)
      } else {
        envContent += `\nGOOGLE_SHEET_ID=${discovered}\n`
      }
      fs.writeFileSync(envPath, envContent)
      log.info("Persisted new GOOGLE_SHEET_ID to .env", { sheetId: discovered })
    }

    process.env.GOOGLE_SHEET_ID = discovered
    return discovered
  }

  // Existing env value matches discovered (or discovery failed) — use it
  if (existing && existing !== "YOUR_GOOGLE_SHEET_ID_HERE") {
    log.info("Using configured GOOGLE_SHEET_ID", { sheetId: existing })
    return existing
  }

  if (!discovered) {
    throw new Error(
      "No spreadsheet found. Share a Google Sheet with your service account email (Editor access) and restart."
    )
  }

  // First-time setup: no env set, use the discovered sheet
  log.info("Auto-discovered sheet ID (first time)", { sheetId: discovered })
  const envPath = path.resolve(__dirname, "../../.env")
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf-8")
    if (envContent.includes("GOOGLE_SHEET_ID=")) {
      envContent = envContent.replace(/GOOGLE_SHEET_ID=.*/, `GOOGLE_SHEET_ID=${discovered}`)
    } else {
      envContent += `\nGOOGLE_SHEET_ID=${discovered}\n`
    }
    fs.writeFileSync(envPath, envContent)
  }
  process.env.GOOGLE_SHEET_ID = discovered
  return discovered
}

// =============================================================
// Sheet Template Setup — creates all tabs via Google Sheets API
// =============================================================

type SheetColor = { red: number; green: number; blue: number }

type TabDefinition = {
  title: string
  headerBg: SheetColor
  headerFg: SheetColor
  headers: string[]
  sampleRows?: string[][]
  frozenRowCount?: number
  hidden?: boolean
  columnWidths?: number[]
  tabColor?: SheetColor
}

type SheetMeta = {
  title: string
  sheetId: number
  index: number
}

const COLORS = {
  graphite: { red: 0.09, green: 0.12, blue: 0.16 },
  slate: { red: 0.21, green: 0.25, blue: 0.31 },
  mist: { red: 0.95, green: 0.97, blue: 0.98 },
  white: { red: 1, green: 1, blue: 1 },
  sage: { red: 0.88, green: 0.93, blue: 0.86 },
  mint: { red: 0.93, green: 0.96, blue: 0.92 },
  blush: { red: 0.97, green: 0.92, blue: 0.92 },
  cream: { red: 0.98, green: 0.96, blue: 0.88 },
  fog: { red: 0.97, green: 0.97, blue: 0.97 },
  ink: { red: 0.17, green: 0.17, blue: 0.17 },
  cyan: { red: 0.0, green: 0.63, blue: 0.74 },
  teal: { red: 0.07, green: 0.60, blue: 0.52 },
  amber: { red: 0.93, green: 0.59, blue: 0.14 },
  coral: { red: 0.88, green: 0.29, blue: 0.22 },
  violet: { red: 0.45, green: 0.26, blue: 0.69 },
  red: { red: 0.74, green: 0.16, blue: 0.16 },
  steel: { red: 0.45, green: 0.51, blue: 0.58 },
  blue: { red: 0.15, green: 0.46, blue: 0.84 },
  green: { red: 0.18, green: 0.55, blue: 0.34 },
  yellow: { red: 0.91, green: 0.73, blue: 0.15 },
} as const satisfies Record<string, SheetColor>

const STATUS_VALUES = ["PENDING", "APPROVED", "EXECUTING", "EXECUTED", "REJECTED", "FAILED"]

const TAB_DEFINITIONS: TabDefinition[] = [
  // ── Primary tabs (visible, ordered) ─────────────────────────
  {
    title: "Settings",
    headerBg: COLORS.sage,
    headerFg: COLORS.ink,
    headers: ["Setting", "Value"],
    sampleRows: [
      ["Wallet Address", "(not set — share sheet then restart to auto-init)"],
      ["Sheet Owner Email", "(auto-detected)"],
      ["Risk Factor", "5"],
    ],
    columnWidths: [180, 280, 140, 140],
    tabColor: COLORS.sage,
    frozenRowCount: 0,
  },
  {
    title: "View Transactions",
    headerBg: COLORS.sage,
    headerFg: COLORS.ink,
    headers: ["Portfolio", "", "", "", "", "", "", ""],
    sampleRows: [
      ["Portfolio loading..."],
    ],
    columnWidths: [160, 80, 110, 120, 120, 110, 110, 90],
    tabColor: COLORS.sage,
    frozenRowCount: 0,
  },
  {
    title: "Connect to Dapp",
    headerBg: COLORS.sage,
    headerFg: COLORS.ink,
    headers: ["Connection", "dApp URL", "WalletConnect URI", "Status", "Timestamp"],
    sampleRows: [
      [
        "TO CONNECT: Paste a WalletConnect URL (starting with wc:) in any cell below",
        "Copy a WalletConnect URL from any dApp's connect wallet dialog",
        "The URI must be a v2 format URL starting with 'wc:' and containing '@2'",
        "The URI will be processed automatically once pasted",
        "Each URI can be used only once - get a fresh URI from the dApp for each connection",
      ],
      [],
      [
        "TROUBLESHOOTING",
        "If connection fails, make sure you're using a fresh WalletConnect URL",
        "URLs expire after a short time (typically 60 seconds)",
        "Make sure the URI starts with 'wc:' and contains '@2' for v2 protocol",
        "Example format: wc:abc123...@2?relay-protocol=irn&symKey=...",
      ],
    ],
    columnWidths: [220, 260, 440, 140, 220],
    tabColor: COLORS.sage,
    frozenRowCount: 1,
    hidden: false,
  },
  {
    title: "Pending Transactions",
    headerBg: COLORS.sage,
    headerFg: COLORS.ink,
    headers: ["Request ID", "Connection ID", "Type", "Details", "Status", "Timestamp", "Approve", "Reject"],
    sampleRows: [
      ["", "", "", "", "", "", "Check this box to approve", "Check this box to reject"],
    ],
    columnWidths: [160, 160, 160, 400, 100, 200, 120, 120],
    tabColor: COLORS.sage,
    frozenRowCount: 1,
    hidden: false,
  },
  {
    title: "Chat with Wallet",
    headerBg: COLORS.sage,
    headerFg: COLORS.ink,
    headers: ["", "", "", "", "", ""],
    sampleRows: [
      ["SheetFra Agent", "", "", "", "", ""],
      ["Your message:", "", "Type your message in B3 and press Enter to send", "", "", ""],
      [],
      ["Chat History", "", "", "", "", ""],
      ["Agent", "Hi. Ask me about your portfolio, prices, swaps, or say 'swap 50 USDT for DOT'.", "", "", "", ""],
    ],
    columnWidths: [140, 320, 240, 90, 90, 90],
    tabColor: COLORS.sage,
    frozenRowCount: 0,
  },
  {
    title: "Agent Logs",
    headerBg: COLORS.sage,
    headerFg: COLORS.ink,
    headers: ["Action Type", "Explanation", "Transaction Hash", "Created At", "Status"],
    columnWidths: [200, 380, 340, 200, 120],
    tabColor: COLORS.sage,
    frozenRowCount: 1,
    hidden: false,
  },
  {
    title: "Risk Rules",
    headerBg: COLORS.red,
    headerFg: COLORS.white,
    headers: ["RULE", "VALUE", "DESCRIPTION"],
    sampleRows: [
      ["max_slippage_bps", "200", "Maximum slippage tolerance in basis points (200 = 2%)"],
      ["allowed_assets", "DOT,USDT,WETH", "Comma-separated list of tokens allowed for trading"],
      ["min_stable_reserve_usd", "500", "Minimum USD value to keep in stablecoins"],
      ["max_single_asset_pct", "60", "Maximum % of portfolio in any single token"],
      ["cooldown_minutes", "5", "Minimum minutes between trade executions"],
      ["max_daily_volume_usd", "10000", "Maximum daily trading volume in USD"],
      ["max_drift_pct", "15", "Maximum allocation drift % before auto-rebalance triggers"],
      ["target_DOT", "40", "Target allocation for DOT when generating rebalances"],
      ["target_USDT", "40", "Target allocation for USDT when generating rebalances"],
      ["target_WETH", "20", "Target allocation for WETH when generating rebalances"],
    ],
    columnWidths: [220, 120, 420],
    tabColor: COLORS.red,
  },
  {
    title: "Dashboard",
    headerBg: COLORS.graphite,
    headerFg: COLORS.white,
    headers: ["", "", "", "", "", "", "", ""],
    sampleRows: [],
    columnWidths: [180, 160, 160, 160, 160, 160, 160, 160],
    tabColor: COLORS.graphite,
    frozenRowCount: 0,
    hidden: true,
  },
  // ── DeFi tabs (visible) ────────────────────────────────────
  {
    title: "DeFi Summary",
    headerBg: COLORS.graphite,
    headerFg: COLORS.white,
    headers: ["CATEGORY", "TOTAL VALUE (USD)", "POSITIONS", "DAILY REWARDS (USD)", "UNCLAIMED REWARDS (USD)", "AVG APY %", "LAST UPDATED"],
    sampleRows: [
      ["Yield Farming", "$—", "—", "$—", "$—", "—%", "—"],
      ["Staking", "$—", "—", "$—", "$—", "—%", "—"],
      ["Liquidity Pools", "$—", "—", "$—", "$—", "—%", "—"],
      ["", "", "", "", "", "", ""],
      ["TOTAL DEFI", "$—", "—", "$—", "$—", "—%", new Date().toISOString()],
    ],
    columnWidths: [160, 160, 100, 180, 200, 100, 200],
    tabColor: { red: 0.18, green: 0.20, blue: 0.24 },
    frozenRowCount: 1,
  },
  {
    title: "Market Insights",
    headerBg: COLORS.graphite,
    headerFg: COLORS.white,
    headers: ["Asset", "Price (USD)", "Source", "Signal", "Updated At"],
    columnWidths: [130, 140, 140, 140, 200],
    tabColor: { red: 0.98, green: 0.75, blue: 0.02 },
    frozenRowCount: 1,
    hidden: true,
  },
  // ── Hidden / legacy tabs (kept for API compat) ─────────────
  {
    title: "Trades",
    headerBg: COLORS.amber,
    headerFg: { red: 0, green: 0, blue: 0 },
    headers: ["TIMESTAMP", "TYPE", "TOKEN IN", "TOKEN OUT", "AMOUNT IN", "AMOUNT OUT", "PRICE", "PRIVATE?", "TX HASH"],
    columnWidths: [180, 140, 110, 110, 120, 120, 130, 180, 220],
    tabColor: COLORS.amber,
    hidden: true,
  },
  {
    title: "Pending Trades",
    headerBg: COLORS.coral,
    headerFg: COLORS.white,
    headers: ["TIMESTAMP", "TOKEN IN", "TOKEN OUT", "AMOUNT", "SLIPPAGE BPS", "STATUS", "TX HASH", "REBALANCE ID", "REASON"],
    sampleRows: [
      ["", "", "", "", "", "PENDING", "", "", "Trades staged from chat will appear here — set STATUS to APPROVED to execute"],
    ],
    columnWidths: [180, 110, 110, 110, 120, 120, 200, 150, 260],
    tabColor: COLORS.coral,
    hidden: true,
  },
  {
    title: "Execution Transcript",
    headerBg: COLORS.graphite,
    headerFg: COLORS.white,
    headers: ["Timestamp", "Request ID", "Source", "Command", "Parsed Action", "Workflow", "Status", "AI ENGINE", "CLI Output", "Tx Hash", "Explorer", "Result"],
    sampleRows: [
      [new Date().toISOString(), "waiting-for-request", "sheet-watcher", "Type in Chat with Wallet or approve a pending trade", "Pending action", "(not started)", "IDLE", "", "", "", "", "Execution updates will appear here automatically"],
    ],
    columnWidths: [180, 210, 140, 320, 220, 170, 140, 340, 360, 220, 280, 340],
    tabColor: COLORS.graphite,
    frozenRowCount: 1,
    hidden: true,
  },
  {
    title: "Approvals",
    headerBg: COLORS.violet,
    headerFg: COLORS.white,
    headers: ["TIMESTAMP", "REBALANCE ID", "ACTION", "POLICY RESULT", "VERIFICATION", "PRIVACY MODE", "TX HASH"],
    columnWidths: [180, 150, 130, 180, 180, 130, 220],
    tabColor: COLORS.violet,
    hidden: true,
  },
  {
    title: "Logs",
    headerBg: COLORS.slate,
    headerFg: COLORS.white,
    headers: ["TIMESTAMP", "LEVEL", "SOURCE", "MESSAGE"],
    columnWidths: [180, 100, 180, 420],
    tabColor: COLORS.slate,
    hidden: true,
  },
  {
    title: "Trade Memos",
    headerBg: COLORS.teal,
    headerFg: COLORS.white,
    headers: ["TIMESTAMP", "MEMO ID", "ACTION", "PAIR", "AMOUNT", "TRIGGER", "REFERENCE PRICE", "POLICY CHECKS", "DRIFT BEFORE", "RATIONALE", "OUTCOME"],
    hidden: true,
    columnWidths: [180, 140, 100, 140, 120, 140, 140, 260, 200, 300, 120],
    tabColor: COLORS.teal,
  },
  {
    title: "Reconciliation",
    headerBg: COLORS.violet,
    headerFg: COLORS.white,
    headers: ["TIMESTAMP", "TRADE REF", "BEFORE TOTAL", "AFTER TOTAL", "DRIFT REDUCTION", "NET IMPACT USD", "STATUS"],
    hidden: true,
    columnWidths: [180, 200, 140, 140, 260, 140, 120],
    tabColor: COLORS.violet,
  },
  {
    title: "Treasury Alerts",
    headerBg: COLORS.red,
    headerFg: COLORS.white,
    headers: ["TIMESTAMP", "ALERT ID", "TYPE", "SEVERITY", "TOKEN", "CURRENT", "THRESHOLD", "MESSAGE", "AUTO ACTION", "REBALANCE ID"],
    hidden: true,
    columnWidths: [180, 140, 130, 100, 100, 120, 120, 300, 150, 150],
    tabColor: COLORS.red,
  },
  {
    title: "Execution Proofs",
    headerBg: COLORS.cyan,
    headerFg: COLORS.white,
    headers: ["TIMESTAMP", "PROOF ID", "PAIR", "AMOUNT", "VENUES COMPARED", "SELECTED VENUE", "REFERENCE PRICE", "SAVINGS", "PRIVACY"],
    hidden: true,
    columnWidths: [180, 140, 140, 120, 260, 150, 140, 140, 100],
    tabColor: COLORS.cyan,
  },
  {
    title: "WalletConnect",
    headerBg: COLORS.violet,
    headerFg: COLORS.white,
    headers: ["TIMESTAMP", "EVENT", "DAPP NAME", "DAPP URL", "CHAINS", "METHOD", "STATUS", "TX HASH / RESULT", "TOPIC"],
    columnWidths: [180, 120, 180, 220, 140, 180, 110, 260, 200],
    tabColor: COLORS.violet,
    hidden: true,
  },
  // ── DeFi detail tabs (hidden by default) ───────────────────
  {
    title: "Yield Farming",
    headerBg: { red: 0.06, green: 0.60, blue: 0.38 },
    headerFg: COLORS.white,
    headers: ["PROTOCOL", "POOL", "TOKEN A", "TOKEN B", "STAKED (USD)", "APY %", "DAILY REWARDS (USD)", "TOTAL EARNED (USD)", "REWARD TOKEN", "RISK", "CHAIN", "LAST UPDATED"],
    sampleRows: [
      ["Hydration", "DOT/USDT", "DOT", "USDT", "$500.00", "4.82%", "$0.07", "$0.93", "HDX", "LOW", "Polkadot Hub", new Date().toISOString().split("T")[0]],
      ["Hydration", "DOT/WETH", "DOT", "WETH", "$—", "2.41%", "$—", "$—", "HDX", "LOW", "Polkadot Hub", "—"],
    ],
    columnWidths: [130, 180, 90, 90, 140, 90, 180, 180, 120, 80, 90, 160],
    tabColor: { red: 0.06, green: 0.60, blue: 0.38 },
    frozenRowCount: 1,
    hidden: true,
  },
  {
    title: "Staking",
    headerBg: { red: 0.48, green: 0.31, blue: 0.72 },
    headerFg: COLORS.white,
    headers: ["PROTOCOL", "VALIDATOR", "TOKEN", "STAKED AMOUNT", "STAKED (USD)", "APR %", "REWARDS EARNED", "REWARDS (USD)", "UNBONDING (DAYS)", "STATUS", "CHAIN", "LAST UPDATED"],
    sampleRows: [
      ["Bifrost", "Bifrost vDOT Pool", "vDOT", "100 vDOT", "$—", "4.20%", "0.35 vDOT", "$—", "0", "ACTIVE", "Polkadot Hub", new Date().toISOString().split("T")[0]],
      ["Polkadot Hub", "Polkadot Hub Validators", "DOT", "50 DOT", "$—", "5.85%", "0.24 DOT", "$—", "28", "ACTIVE", "Polkadot Hub", new Date().toISOString().split("T")[0]],
    ],
    columnWidths: [140, 200, 80, 130, 130, 80, 160, 120, 150, 100, 90, 160],
    tabColor: { red: 0.48, green: 0.31, blue: 0.72 },
    frozenRowCount: 1,
    hidden: true,
  },
  {
    title: "Liquidity Pools",
    headerBg: { red: 0.07, green: 0.47, blue: 0.73 },
    headerFg: COLORS.white,
    headers: ["PROTOCOL", "PAIR", "TOKEN A AMT", "TOKEN B AMT", "TOTAL VALUE (USD)", "POOL SHARE %", "TVL (USD)", "FEE TIER", "FEES EARNED (USD)", "IL LOSS (USD)", "APY %", "IN RANGE", "CHAIN", "LAST UPDATED"],
    sampleRows: [
      ["Hydration Omnipool", "DOT/USDT", "200 DOT", "500 USDT", "$400.00", "0.0021%", "$1,800,000", "0.05%", "$1.14", "$0.14", "18.7%", "YES", "Polkadot Hub", new Date().toISOString().split("T")[0]],
      ["Hydration Omnipool", "DOT/WETH", "150 DOT", "0.065 WETH", "$300.00", "0.0059%", "$5,100,000", "0.01%", "$1.14", "$0.02", "8.34%", "YES", "Polkadot Hub", new Date().toISOString().split("T")[0]],
    ],
    columnWidths: [130, 130, 120, 120, 150, 100, 130, 90, 150, 120, 80, 80, 90, 160],
    tabColor: { red: 0.07, green: 0.47, blue: 0.73 },
    frozenRowCount: 1,
    hidden: true,
  },
  // ── Track-specific tabs (visible for hackathon) ───────────
  {
    title: "Stablecoin Reserve",
    headerBg: COLORS.green,
    headerFg: COLORS.white,
    headers: ["METRIC", "VALUE", "TARGET", "STATUS", "LAST UPDATED"],
    sampleRows: [
      ["USDT Balance", "$0.00", "—", "Syncing...", new Date().toISOString().split("T")[0]],
      ["Stablecoin % of Portfolio", "0%", "40%", "—", "—"],
      ["Minimum Reserve", "—", "$500", "See Risk Rules", "—"],
      ["Reserve Health", "—", "HEALTHY", "—", "—"],
      [],
      ["RESERVE RULES (edit in Risk Rules tab)", "", "", "", ""],
      ["min_stable_reserve_usd", "$500", "Minimum USD in stablecoins", "", ""],
      ["target_USDT", "40%", "Target USDT allocation", "", ""],
      [],
      ["AI COMMANDS", "", "", "", ""],
      ["Try in Chat:", "'How much stablecoin reserve do I have?'", "", "", ""],
      ["", "'Rebalance to 40% USDT'", "", "", ""],
      ["", "'What percentage of my portfolio is in stablecoins?'", "", "", ""],
    ],
    columnWidths: [220, 160, 160, 140, 200],
    tabColor: COLORS.green,
    frozenRowCount: 1,
  },
  {
    title: "XCM / Cross-Chain",
    headerBg: COLORS.violet,
    headerFg: COLORS.white,
    headers: ["PROPERTY", "VALUE", "DETAILS"],
    sampleRows: [
      ["XCM Precompile Address", "0xA0000", "Polkadot Hub XCM precompile"],
      ["Bridge Contract", "SheetFraXcmBridge.sol", "Deployed on Polkadot Hub Testnet"],
      ["Status", "Active", "Track 2: PVM Precompiles"],
      [],
      ["CAPABILITIES", "", ""],
      ["weighMessage()", "Estimate XCM message cost", "IXcm.weighMessage(bytes) → Weight"],
      ["execute()", "Execute XCM message locally", "IXcm.execute(bytes, Weight)"],
      ["send()", "Send XCM to destination", "IXcm.send(bytes dest, bytes msg)"],
      [],
      ["CONNECTED CHAINS", "", ""],
      ["Hydration", "Primary DEX", "DOT/USDT/WETH swaps via Omnipool"],
      ["Bifrost", "Liquid Staking", "vDOT (~12-15% APY)"],
      ["Snowbridge", "Ethereum Bridge", "WETH and ERC-20 bridging"],
      [],
      ["AUDIT TRAIL", "", ""],
      ["XcmWeighRequested", "Emitted on weigh calls", "Logs caller, weight, sheet reference"],
      ["XcmExecuteRequested", "Emitted on execute calls", "Logs caller, operationId, sheet reference"],
    ],
    columnWidths: [220, 240, 320],
    tabColor: COLORS.violet,
    frozenRowCount: 1,
  },
]

const TAB_ORDER = [
  "Settings",
  "View Transactions",
  "Connect to Dapp",
  "Pending Transactions",
  "Chat with Wallet",
  "Agent Logs",
  "Stablecoin Reserve",
  "XCM / Cross-Chain",
  "Pending Trades",
  "Trades",
  "Execution Transcript",
  "Risk Rules",
  "Dashboard",
  "DeFi Summary",
  "Market Insights",
]

function getTabDefinition(title: string): TabDefinition | undefined {
  return TAB_DEFINITIONS.find((tab) => tab.title === title)
}

function buildSheetMap(sheets: sheets_v4.Schema$Sheet[] | undefined): Map<string, SheetMeta> {
  const map = new Map<string, SheetMeta>()
  for (const sheet of sheets || []) {
    const title = sheet.properties?.title
    const sheetId = sheet.properties?.sheetId
    const index = sheet.properties?.index
    if (title && sheetId !== undefined && sheetId !== null && index !== undefined && index !== null) {
      map.set(title, { title, sheetId, index })
    }
  }
  return map
}

async function getSheetMap(spreadsheetId: string): Promise<Map<string, SheetMeta>> {
  const sheets = await getSheetsClient()
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  return buildSheetMap(spreadsheet.data.sheets)
}

async function batchUpdateSpreadsheet(
  spreadsheetId: string,
  requests: sheets_v4.Schema$Request[]
): Promise<void> {
  if (requests.length === 0) return
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  })
}

async function createTab(
  spreadsheetId: string,
  tab: TabDefinition
): Promise<number> {
  const sheets = await getSheetsClient()
  const sheetProperties = {
    title: tab.title,
    hidden: tab.hidden ?? false,
    tabColor: tab.tabColor,
    gridProperties: { frozenRowCount: tab.frozenRowCount ?? 1 },
  } as unknown as sheets_v4.Schema$SheetProperties

  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: sheetProperties,
          },
        },
      ],
    },
  })

  const newSheetId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId
  if (newSheetId === undefined || newSheetId === null) {
    throw new Error(`Failed to create sheet tab: ${tab.title}`)
  }

  await batchUpdateSpreadsheet(spreadsheetId, [
    {
      repeatCell: {
        range: {
          sheetId: newSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: tab.headers.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: tab.headerBg,
            horizontalAlignment: "CENTER",
            textFormat: {
              foregroundColor: tab.headerFg,
              bold: true,
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)",
      },
    },
    ...buildColumnWidthRequests(newSheetId, tab.columnWidths),
  ])

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab.title}'!A1:${colLetter(tab.headers.length)}1`,
    valueInputOption: "RAW",
    requestBody: { values: [tab.headers] },
  })

  if (tab.sampleRows && tab.sampleRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tab.title}'!A2:${colLetter(tab.headers.length)}${1 + tab.sampleRows.length}`,
      valueInputOption: "RAW",
      requestBody: { values: tab.sampleRows },
    })
  }

  return newSheetId
}

function buildColumnWidthRequests(
  sheetId: number,
  columnWidths: number[] | undefined
): sheets_v4.Schema$Request[] {
  if (!columnWidths || columnWidths.length === 0) return []
  return columnWidths.map((pixelSize, index) => ({
    updateDimensionProperties: {
      range: {
        sheetId,
        dimension: "COLUMNS",
        startIndex: index,
        endIndex: index + 1,
      },
      properties: { pixelSize },
      fields: "pixelSize",
    },
  }))
}

async function ensureTabOrder(spreadsheetId: string): Promise<void> {
  let sheetMap = await getSheetMap(spreadsheetId)
  let targetIndex = 0

  for (const title of TAB_ORDER) {
    const meta = sheetMap.get(title)
    if (!meta) continue
    if (meta.index !== targetIndex) {
      await batchUpdateSpreadsheet(spreadsheetId, [
        {
          updateSheetProperties: {
            properties: { sheetId: meta.sheetId, index: targetIndex },
            fields: "index",
          },
        },
      ])
      sheetMap = await getSheetMap(spreadsheetId)
    }
    targetIndex += 1
  }
}

async function applyTemplatePresentation(spreadsheetId: string): Promise<void> {
  const sheetMap = await getSheetMap(spreadsheetId)
  const requests: sheets_v4.Schema$Request[] = []

  for (const tab of TAB_DEFINITIONS) {
    const meta = sheetMap.get(tab.title)
    if (!meta) continue
    const properties = {
      sheetId: meta.sheetId,
      hidden: tab.hidden ?? false,
      tabColor: tab.tabColor,
      gridProperties: { frozenRowCount: tab.frozenRowCount ?? 1 },
    } as unknown as sheets_v4.Schema$SheetProperties
    requests.push({
      updateSheetProperties: {
        properties,
        fields: "hidden,tabColor,gridProperties.frozenRowCount",
      },
    })
    requests.push(...buildColumnWidthRequests(meta.sheetId, tab.columnWidths))
  }

  await batchUpdateSpreadsheet(spreadsheetId, requests)
  await applyPendingTradeValidation(spreadsheetId, sheetMap)
  await ensureTabOrder(spreadsheetId)
}

async function applyPendingTradeValidation(
  spreadsheetId: string,
  sheetMap: Map<string, SheetMeta>
): Promise<void> {
  const requests: sheets_v4.Schema$Request[] = []

  // Status dropdown on Pending Trades tab (column F)
  for (const title of ["Pending Trades"]) {
    const meta = sheetMap.get(title)
    if (!meta) continue
    requests.push({
      setDataValidation: {
        range: {
          sheetId: meta.sheetId,
          startRowIndex: 1,
          endRowIndex: 500,
          startColumnIndex: 5,
          endColumnIndex: 6,
        },
        rule: {
          strict: true,
          showCustomUi: true,
          condition: {
            type: "ONE_OF_LIST",
            values: STATUS_VALUES.map((value) => ({ userEnteredValue: value })),
          },
        },
      },
    })
  }

  // Checkboxes on Pending Transactions tab (columns G=Approve, H=Reject)
  const ptMeta = sheetMap.get("Pending Transactions")
  if (ptMeta) {
    // Approve column (G = index 6)
    requests.push({
      setDataValidation: {
        range: {
          sheetId: ptMeta.sheetId,
          startRowIndex: 2,
          endRowIndex: 500,
          startColumnIndex: 6,
          endColumnIndex: 7,
        },
        rule: {
          strict: true,
          showCustomUi: true,
          condition: { type: "BOOLEAN" },
        },
      },
    })
    // Reject column (H = index 7)
    requests.push({
      setDataValidation: {
        range: {
          sheetId: ptMeta.sheetId,
          startRowIndex: 2,
          endRowIndex: 500,
          startColumnIndex: 7,
          endColumnIndex: 8,
        },
        rule: {
          strict: true,
          showCustomUi: true,
          condition: { type: "BOOLEAN" },
        },
      },
    })
  }

  await batchUpdateSpreadsheet(spreadsheetId, requests)
}

function getWorkflowModeSummary(): string {
  return "Direct onchain reads + local execution"
}

async function syncSettingsTab(spreadsheetId: string): Promise<void> {
  const sheets = await getSheetsClient()
  const values = [
    ["Setting", "Value", "", ""],
    ["Wallet Address", process.env.WALLET_ADDRESS || "(not set — share sheet then restart to auto-init)", "", ""],
    ["Sheet Owner Email", process.env.SHEET_OWNER_EMAIL || "(auto-detected)", "", ""],
    ["Risk Factor", "5", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "", "", ""],
    ["", "Hi there, welcome to", "", ""],
    ["", "SheetFra", "", ""],
    ["", "Google Sheets as a Wallet", "", ""],
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Settings!A1:D12",
    valueInputOption: "RAW",
    requestBody: { values },
  })
}

async function syncConnectToDappScaffold(spreadsheetId: string): Promise<void> {
  const sheets = await getSheetsClient()
  const values = [
    ["Connection", "dApp URL", "WalletConnect URI", "Status", "Timestamp"],
    [
      "TO CONNECT: Paste a WalletConnect URL (starting with wc:) in any cell below",
      "Copy a WalletConnect URL from any dApp's connect wallet dialog",
      "The URI must be a v2 format URL starting with 'wc:' and containing '@2'",
      "The URI will be processed automatically once pasted",
      "Each URI can be used only once - get a fresh URI from the dApp for each connection",
    ],
    ["", "", "", "", ""],
    [
      "TROUBLESHOOTING",
      "If connection fails, make sure you're using a fresh WalletConnect URL",
      "URLs expire after a short time (typically 60 seconds)",
      "Make sure the URI starts with 'wc:' and contains '@2' for v2 protocol",
      "Example format: wc:abc123...@2?relay-protocol=irn&symKey=...",
    ],
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Connect to Dapp'!A1:E4",
    valueInputOption: "RAW",
    requestBody: { values },
  })
}

async function syncPendingTransactionsScaffold(spreadsheetId: string): Promise<void> {
  const sheets = await getSheetsClient()
  const values = [
    ["Request ID", "Connection ID", "Type", "Details", "Status", "Timestamp", "Approve", "Reject"],
    ["", "", "", "", "", "", "Check this box to approve", "Check this box to reject"],
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Pending Transactions'!A1:H2",
    valueInputOption: "RAW",
    requestBody: { values },
  })
}

async function syncChatWithWalletScaffold(spreadsheetId: string): Promise<void> {
  const sheets = await getSheetsClient()
  const values = [
    ["", "", "", "", "", ""],
    ["SheetFra Agent", "", "", "", "", ""],
    ["Your message:", "", "Type your message in B3 and press Enter to send", "", "", ""],
    ["", "", "", "", "", ""],
    ["Chat History", "", "", "", "", ""],
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Chat with Wallet'!A1:F5",
    valueInputOption: "RAW",
    requestBody: { values },
  })
}

async function syncAgentLogsScaffold(spreadsheetId: string): Promise<void> {
  const sheets = await getSheetsClient()
  const values = [["Action", "Explanation", "Transaction Hash", "Created At", "Status"]]
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Agent Logs'!A1:E1",
    valueInputOption: "RAW",
    requestBody: { values },
  })
}

async function syncViewTransactionsScaffold(spreadsheetId: string): Promise<void> {
  // Attempt to fetch real portfolio data; fall back to zeros if wallet not configured or RPC fails
  try {
    const walletAddress = process.env.WALLET_ADDRESS
    if (walletAddress) {
      const { fetchPortfolio, portfolioToSheetData } = await import("./portfolio")
      const portfolio = await fetchPortfolio(walletAddress)
      await updatePortfolioTabRich(spreadsheetId, portfolioToSheetData(portfolio))
      return
    }
  } catch (err) {
    const log = createLogger("sheets")
    log.warn("Real portfolio fetch failed during sync, using empty state", { error: (err as Error).message })
  }

  // Fallback: empty state
  await updatePortfolioTabRich(spreadsheetId, {
    walletAddress: process.env.WALLET_ADDRESS || "0x0000000000000000000000000000000000000000",
    network: POLKADOT_HUB_TESTNET.name,
    totalValueUsd: "0",
    prices: {
      DOT_USD: "0",
      USDT_USD: "0",
      WETH_USD: "0",
    },
    balances: {
      DOT: "0",
      USDT: "0",
      WETH: "0",
    },
    timestamp: Date.now(),
  })
}

async function syncPrimaryExperienceTabs(spreadsheetId: string): Promise<void> {
  await syncSettingsTab(spreadsheetId)
  await syncViewTransactionsScaffold(spreadsheetId)
  await syncConnectToDappScaffold(spreadsheetId)
  await syncPendingTransactionsScaffold(spreadsheetId)
  await syncChatWithWalletScaffold(spreadsheetId)
  await syncAgentLogsScaffold(spreadsheetId)
  await formatPrimaryExperienceTabs(spreadsheetId)
}

/**
 * Updates only the Wallet Address row in the Settings tab after auto-init.
 * Writes wallet address to B2 and secret ID to B3 so they persist in the sheet.
 */
export async function writeWalletToSettings(
  spreadsheetId: string,
  walletAddress: string,
  secretId: string,
): Promise<void> {
  try {
    const sheets = await getSheetsClient()
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Settings!B2",
      valueInputOption: "RAW",
      requestBody: { values: [[walletAddress]] },
    })
    log.info("Wallet address written to Settings tab", { walletAddress: walletAddress.slice(0, 10) + "..." })
  } catch (err) {
    log.warn("writeWalletToSettings failed (non-fatal)", { error: (err as Error).message })
  }
}

/**
 * Creates all required tabs in the spreadsheet if they don't exist.
 * Safe to call multiple times — skips existing tabs.
 * Returns the list of newly created tab names.
 */
export async function setupSheetTemplate(spreadsheetId: string): Promise<string[]> {
  const sheets = await getSheetsClient()

  // Get existing sheet tabs
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const existingTabs = buildSheetMap(spreadsheet.data.sheets)

  const created: string[] = []

  for (const tab of TAB_DEFINITIONS) {
    if (existingTabs.has(tab.title)) {
      log.info("Tab already exists, skipping", { tab: tab.title })
      continue
    }

    await createTab(spreadsheetId, tab)

    log.info("Created tab", { tab: tab.title })
    created.push(tab.title)
  }

  await applyTemplatePresentation(spreadsheetId)
  await syncPrimaryExperienceTabs(spreadsheetId)

  // Create charts on the Dashboard tab
  try {
    await createDashboardCharts(spreadsheetId)
  } catch (err) {
    log.warn("Dashboard chart creation failed (non-fatal)", { error: (err as Error).message })
  }

  // Write initial log entry
  if (created.includes("Logs")) {
    await appendLogEntry(spreadsheetId, "INFO", "setup", `Template created: ${created.join(", ")}`)
  }

  return created
}

/** Convert 1-based column count to a letter (1=A, 2=B, …, 9=I) */
function colLetter(n: number): string {
  return String.fromCharCode(64 + n)
}

export async function updatePortfolioTab(
  spreadsheetId: string,
  data: {
    totalValueUsd: string
    prices?: Record<string, string>
    balances?: Record<string, string>
    timestamp: number
  }
): Promise<void> {
  const sheets = await getSheetsClient()

  // Format prices from 8-decimal bigint strings to human-readable
  const formatPrice = (raw: string | undefined): string => {
    if (!raw || raw === "0") return "N/A"
    const num = Number(BigInt(raw)) / 1e8
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Format token balance from raw wei/smallest-unit string
  const formatBalance = (raw: string | undefined, decimals: number): string => {
    if (!raw || raw === "0") return "0"
    const num = Number(BigInt(raw)) / Math.pow(10, decimals)
    return num.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  }

  // Compute USD value from balance + price (both in raw bigints)
  const computeUsd = (balRaw: string | undefined, priceRaw: string | undefined, decimals: number): string => {
    if (!balRaw || !priceRaw || balRaw === "0" || priceRaw === "0") return "---"
    const value = (Number(BigInt(balRaw)) / Math.pow(10, decimals)) * (Number(BigInt(priceRaw)) / 1e8)
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const prices = data.prices ?? {}
  const balances = data.balances ?? {}
  const totalFormatted = formatPrice(data.totalValueUsd)
  const timestamp = new Date(data.timestamp).toISOString()

  // Build portfolio rows with real balances
  const values = [
    ["TOKEN", "BALANCE", "PRICE", "USD VALUE", "CHAIN"],
    [
      "DOT",
      formatBalance(balances["DOT"], 10),
      formatPrice(prices["DOT_USD"]),
      computeUsd(balances["DOT"], prices["DOT_USD"], 10),
      "Polkadot Hub",
    ],
    [
      "USDT",
      formatBalance(balances["USDT"], 6),
      formatPrice(prices["USDT_USD"]),
      computeUsd(balances["USDT"], prices["USDT_USD"], 6),
      "Polkadot Hub",
    ],
    [
      "WETH",
      formatBalance(balances["WETH"], 18),
      formatPrice(prices["WETH_USD"]),
      computeUsd(balances["WETH"], prices["WETH_USD"], 18),
      "Polkadot Hub",
    ],
    [],
    [`TOTAL VALUE: ${totalFormatted}`, "", "", `Updated by Agent`, ""],
    [`Last Agent Run: ${timestamp}`, "", "", "", ""],
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Portfolio!A1:E10",
    valueInputOption: "RAW",
    requestBody: { values },
  })

  log.info("Portfolio tab updated", { total: totalFormatted })
}

export async function updateTradesTab(
  spreadsheetId: string,
  trade: {
    timestamp: string
    type: string
    pair: string
    amountIn: string
    amountOut: string
    chainlinkPrice: string
    status: string
    isPrivate: boolean
    txHash?: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()

  // Parse pair "USDC -> WETH" into tokenIn and tokenOut columns
  const [tokenIn, tokenOut] = trade.pair.includes("->")
    ? trade.pair.split("->").map(s => s.trim())
    : [trade.pair, ""]

  const explorerLink = trade.txHash ? `${POLKADOT_HUB_TESTNET.blockExplorer}/tx/${trade.txHash}` : ""

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Trades!A:I",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          trade.timestamp,
          trade.type,
          tokenIn,
          tokenOut,
          trade.amountIn,
          trade.amountOut,
          trade.chainlinkPrice,
          trade.isPrivate ? "PRIVATE" : "PUBLIC",
          trade.txHash || explorerLink || "---",
        ],
      ],
    },
  })

  log.info("Trade logged", { type: trade.type, pair: trade.pair })
}

export async function updateAICommandsTab(
  spreadsheetId: string,
  data: {
    command: string
    status: string
    workflow: string
    aiParsed: string
    chainlinkPrice: string
    result: string
    txHash: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()

  const values = [
    ["COMMAND:", data.command],
    ["STATUS:", data.status],
    ["WORKFLOW:", data.workflow],
    ["AI PARSED:", data.aiParsed],
    ["CHAINLINK PRICE:", data.chainlinkPrice],
    ["RESULT:", data.result],
    ["TX HASH:", data.txHash],
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "AI Commands!A1:B7",
    valueInputOption: "RAW",
    requestBody: { values },
  })

  log.info("AI Commands tab updated", { status: data.status })
}

export async function appendLogEntry(
  spreadsheetId: string,
  level: string,
  source: string,
  message: string
): Promise<void> {
  const sheets = await getSheetsClient()

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Logs!A:D",
    valueInputOption: "RAW",
    requestBody: {
      values: [[new Date().toISOString(), level, source, message]],
    },
  })
}

// ── Treasury Desk: Risk Rules ──────────────────────────────

import type { RiskRules, DEFAULT_RISK_RULES as DefaultRiskRulesType, ApprovalRecord, RebalanceLeg, TradeMemo, ReconciliationRecord, TreasuryAlert, ExecutionProof, ExecutionTranscriptRow } from "../types"
import { DEFAULT_RISK_RULES } from "../types"

/**
 * Reads Risk Rules from the Risk Rules tab.
 * Falls back to DEFAULT_RISK_RULES if the tab is empty or missing.
 */
export async function readRiskRules(spreadsheetId: string): Promise<RiskRules> {
  try {
    const sheets = await getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Risk Rules'!A2:B20",
    })
    const rows = res.data.values || []
    const rules: Record<string, string> = {}
    for (const row of rows) {
      if (row[0] && row[1]) rules[String(row[0]).trim()] = String(row[1]).trim()
    }

    return {
      maxSlippageBps: parseInt(rules["max_slippage_bps"] || "") || DEFAULT_RISK_RULES.maxSlippageBps,
      allowedAssets: (rules["allowed_assets"] || DEFAULT_RISK_RULES.allowedAssets.join(",")).split(",").map(s => s.trim().toUpperCase()),
      minStableReserveUsd: parseFloat(rules["min_stable_reserve_usd"] || "") || DEFAULT_RISK_RULES.minStableReserveUsd,
      maxSingleAssetPct: parseFloat(rules["max_single_asset_pct"] || "") || DEFAULT_RISK_RULES.maxSingleAssetPct,
      cooldownMinutes: parseFloat(rules["cooldown_minutes"] || "") || DEFAULT_RISK_RULES.cooldownMinutes,
      maxDailyVolumeUsd: parseFloat(rules["max_daily_volume_usd"] || "") || DEFAULT_RISK_RULES.maxDailyVolumeUsd,
      maxDriftPct: parseFloat(rules["max_drift_pct"] || "") || DEFAULT_RISK_RULES.maxDriftPct,
    }
  } catch {
    return { ...DEFAULT_RISK_RULES }
  }
}

/**
 * Appends an approval record to the Approvals tab.
 */
export async function appendApprovalRecord(
  spreadsheetId: string,
  record: ApprovalRecord
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Approvals!A:G",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        record.timestamp,
        record.rebalanceId,
        record.action,
        record.policyResult,
        record.verification,
        record.privacyMode ? "PRIVATE" : "PUBLIC",
        record.txHash,
      ]],
    },
  })
}

/**
 * Writes rebalance legs as pending trade rows.
 */
export async function writePendingRebalanceLegs(
  spreadsheetId: string,
  legs: RebalanceLeg[]
): Promise<void> {
  const sheets = await getSheetsClient()
  const rows = legs.map(leg => [
    new Date().toISOString(),
    leg.tokenIn,
    leg.tokenOut,
    String(leg.amount),
    "50",         // default slippage
    "PENDING",
    "",           // tx hash
    leg.rebalanceId,
    `[plan:${leg.planLegId}] ${leg.reason}`,
  ])
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Pending Trades'!A:I",
    valueInputOption: "RAW",
    requestBody: { values: rows },
  })
}

/**
 * Stages a single pending trade row from AI/chat intent.
 * The user must set STATUS to APPROVED to execute.
 */
export async function stagePendingTrade(
  spreadsheetId: string,
  trade: {
    tokenIn: string
    tokenOut: string
    amount: number
    slippageBps?: number
    reason: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Pending Trades'!A:I",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        new Date().toISOString(),
        trade.tokenIn,
        trade.tokenOut,
        String(trade.amount),
        String(trade.slippageBps ?? 50),
        "PENDING",
        "",
        "",
        `[AI] ${trade.reason}`,
      ]],
    },
  })
}

/**
 * Updates execution state columns on a Pending Trades row.
 * Column F = STATUS, column G = TX HASH / error detail.
 */
export async function updatePendingTradeExecution(
  spreadsheetId: string,
  row: number,
  status: string,
  txOrDetail?: string
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'Pending Trades'!F${row}:G${row}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[status, txOrDetail || ""]],
    },
  })
}

/**
 * Reads current target allocations from the Risk Rules tab (rows with "target_" prefix).
 * Returns a map of token -> target percentage.
 */
export async function readTargetAllocations(spreadsheetId: string): Promise<Record<string, number>> {
  try {
    const sheets = await getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Risk Rules'!A2:B20",
    })
    const rows = res.data.values || []
    const targets: Record<string, number> = {}
    for (const row of rows) {
      const key = String(row[0] || "").trim()
      if (key.startsWith("target_")) {
        const token = key.replace("target_", "").toUpperCase()
        targets[token] = parseFloat(String(row[1])) || 0
      }
    }
    return targets
  } catch {
    return {}
  }
}

// ── Trade Memos ────────────────────────────────────────────

export async function appendTradeMemo(
  spreadsheetId: string,
  memo: TradeMemo
): Promise<void> {
  const sheets = await getSheetsClient()
  const policyStr = memo.policyChecks
    .map(p => `${p.passed ? "✓" : "✗"} ${p.rule}: ${p.value}/${p.limit}`)
    .join("; ")
  const driftStr = memo.driftBefore
    ? Object.entries(memo.driftBefore).map(([t, d]) => `${t}: ${d > 0 ? "+" : ""}${d.toFixed(1)}%`).join(", ")
    : "N/A"

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Trade Memos'!A:K",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        memo.timestamp,
        memo.memoId,
        memo.action,
        `${memo.tokenIn} -> ${memo.tokenOut}`,
        memo.amount,
        memo.triggerSource,
        memo.chainlinkPrice,
        policyStr,
        driftStr,
        memo.rationale,
        memo.outcome,
      ]],
    },
  })
}

// ── Reconciliation ─────────────────────────────────────────

export async function appendReconciliationRecord(
  spreadsheetId: string,
  record: ReconciliationRecord
): Promise<void> {
  const sheets = await getSheetsClient()
  const driftStr = Object.entries(record.driftReduction)
    .map(([t, d]) => `${t}: ${d > 0 ? "+" : ""}${d.toFixed(1)}%`)
    .join(", ")

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Reconciliation'!A:G",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        record.timestamp,
        record.tradeRef,
        `$${record.before.totalValueUsd.toFixed(2)}`,
        `$${record.after.totalValueUsd.toFixed(2)}`,
        driftStr,
        `$${record.netImpactUsd.toFixed(2)}`,
        record.status,
      ]],
    },
  })
}

// ── Treasury Alerts ────────────────────────────────────────

export async function appendTreasuryAlert(
  spreadsheetId: string,
  alert: TreasuryAlert
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Treasury Alerts'!A:J",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        alert.timestamp,
        alert.alertId,
        alert.alertType,
        alert.severity,
        alert.token || "",
        alert.currentValue,
        alert.threshold,
        alert.message,
        alert.autoAction || "",
        alert.rebalanceId || "",
      ]],
    },
  })
}

// ── Execution Proofs ───────────────────────────────────────

export async function appendExecutionProof(
  spreadsheetId: string,
  proof: ExecutionProof
): Promise<void> {
  const sheets = await getSheetsClient()
  const venuesStr = proof.venues
    .map(v => `${v.venue}: ${v.quoteAmount}${v.selected ? " ★" : ""}`)
    .join("; ")

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Execution Proofs'!A:I",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        proof.timestamp,
        proof.proofId,
        `${proof.tokenIn} -> ${proof.tokenOut}`,
        proof.amount,
        venuesStr,
        proof.routingMode ? `${proof.selectedVenue} (${proof.routingMode})` : proof.selectedVenue,
        proof.oracleDeviationBps ? `${proof.chainlinkPrice} | ${proof.oracleDeviationBps} bps vs oracle` : proof.chainlinkPrice,
        proof.oracleReferenceQuote ? `${proof.savingsVsBestPublic} | oracle ref ${proof.oracleReferenceQuote}` : proof.savingsVsBestPublic,
        proof.privacyMode ? "PRIVATE" : "PUBLIC",
      ]],
    },
  })
}

// ── WalletConnect Events ───────────────────────────────────

export async function appendWalletConnectEvent(
  spreadsheetId: string,
  event: {
    event: string
    dappName: string
    dappUrl: string
    chains: string[]
    method?: string
    status: string
    result?: string
    topic: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'WalletConnect'!A:I",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        new Date().toISOString(),
        event.event,
        event.dappName,
        event.dappUrl,
        event.chains.join(", "),
        event.method || "",
        event.status,
        event.result || "",
        event.topic,
      ]],
    },
  })
}

// ── Dashboard tab sync ─────────────────────────────────────

export async function syncDashboardTab(
  spreadsheetId: string,
  data: {
    portfolioValue?: string
    dailyVolume?: string
    pendingTradesCount?: number
    connectedDApps?: number
    lastCRERun?: string
    walletAddress?: string
    workflowMode?: string
    agentStatus?: string
    // Distribution data for charts
    ethValueUsd?: number
    usdcValueUsd?: number
    linkValueUsd?: number
    healthScore?: number
    healthBand?: string
    riskPressure?: string
    autopilotMode?: string
    proofCount?: number
    criticalAlerts?: number
    protectedAlpha?: string
    topRecommendation?: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()

  const ethVal = data.ethValueUsd ?? 0
  const usdcVal = data.usdcValueUsd ?? 0
  const linkVal = data.linkValueUsd ?? 0
  const total = ethVal + usdcVal + linkVal
  const pct = (v: number) => total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0%"

  const values = [
    // Row 1-2: Title
    ["⚡ SheetFra Dashboard", "", "", "", "Last Updated", data.lastCRERun || new Date().toISOString(), "", ""],
    [],
    // Row 3-4: Summary cards
    ["💰 Portfolio Value", data.portfolioValue || "$0.00", "", "🧠 Treasury Health", data.healthScore !== undefined ? `${data.healthScore}/100 ${data.healthBand || ""}`.trim() : "N/A", "", "🛡 Protected Edge", data.protectedAlpha || "No proofs yet"],
    ["🔗 Wallet", data.walletAddress ? `${data.walletAddress.substring(0, 10)}...${data.walletAddress.slice(-6)}` : "(not set)", "", "⚠ Risk Pressure", data.riskPressure || "unknown", "", "🤖 Autopilot", data.autopilotMode || "watching"],
    [],
    // Row 6: Section header for allocation chart data
    ["Asset Allocation", "", "", "", "Mission Control", ""],
    // Row 7: Chart data headers
    ["Asset", "Value (USD)", "% Share", "", "Metric", "Value"],
    // Row 8-10: Chart data rows
    ["DOT", ethVal, pct(ethVal), "", "Critical Alerts", String(data.criticalAlerts ?? 0)],
    ["USDT", usdcVal, pct(usdcVal), "", "Pending Trades", String(data.pendingTradesCount ?? 0)],
    ["WETH", linkVal, pct(linkVal), "", "Execution Proofs", String(data.proofCount ?? 0)],
    [],
    // Row 12: Allocation bar (visual)
    ["Top Recommendation", data.topRecommendation || "Run a private quote to show execution proof and protected routing."],
    [
      "DOT", ethVal > 0 ? "█".repeat(Math.max(1, Math.round((ethVal / Math.max(total, 1)) * 30))) : "",
      "USDT", usdcVal > 0 ? "█".repeat(Math.max(1, Math.round((usdcVal / Math.max(total, 1)) * 30))) : "",
      "WETH", linkVal > 0 ? "█".repeat(Math.max(1, Math.round((linkVal / Math.max(total, 1)) * 30))) : "",
      "", data.workflowMode || getWorkflowModeSummary(),
    ],
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "Dashboard!A1:H13",
    valueInputOption: "RAW",
    requestBody: { values },
  })

  // Apply formatting to dashboard
  await formatDashboardTab(spreadsheetId)
}

// ── Connect to Dapp tab ─────────────────────────────────────

/**
 * Applies rich formatting to the Dashboard tab - bold titles, colors, number formats.
 */
async function formatDashboardTab(spreadsheetId: string): Promise<void> {
  const sheetMap = await getSheetMap(spreadsheetId)
  const meta = sheetMap.get("Dashboard")
  if (!meta) return

  const requests: sheets_v4.Schema$Request[] = [
    // Title row - large bold blue text
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 16, foregroundColor: COLORS.blue },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },
    // Summary cards row 3 - bold labels
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.96, green: 0.96, blue: 0.98 },
            borders: {
              bottom: { style: "SOLID", color: { red: 0.85, green: 0.85, blue: 0.9 } },
            },
          },
        },
        fields: "userEnteredFormat(backgroundColor,borders)",
      },
    },
    // Values in summary - larger font
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 1, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 12, foregroundColor: COLORS.green },
          },
        },
        fields: "userEnteredFormat.textFormat",
      },
    },
    // Section headers (row 6, 12) - bold with bottom border
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 4 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 12 },
            borders: { bottom: { style: "SOLID", color: COLORS.blue } },
          },
        },
        fields: "userEnteredFormat(textFormat,borders)",
      },
    },
    // Chart data header (row 7)
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 6, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 6 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 10 },
            backgroundColor: { red: 0.93, green: 0.93, blue: 0.96 },
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    },
    // Allocation bar header
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, fontSize: 11 },
            borders: { bottom: { style: "SOLID", color: COLORS.blue } },
          },
        },
        fields: "userEnteredFormat(textFormat,borders)",
      },
    },
    // Color the allocation bar values - ETH blue, USDC green, LINK purple
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 12, endRowIndex: 13, startColumnIndex: 1, endColumnIndex: 2 },
        cell: { userEnteredFormat: { textFormat: { foregroundColor: COLORS.blue } } },
        fields: "userEnteredFormat.textFormat.foregroundColor",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 12, endRowIndex: 13, startColumnIndex: 3, endColumnIndex: 4 },
        cell: { userEnteredFormat: { textFormat: { foregroundColor: COLORS.green } } },
        fields: "userEnteredFormat.textFormat.foregroundColor",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 12, endRowIndex: 13, startColumnIndex: 5, endColumnIndex: 6 },
        cell: { userEnteredFormat: { textFormat: { foregroundColor: COLORS.violet } } },
        fields: "userEnteredFormat.textFormat.foregroundColor",
      },
    },
  ]

  await batchUpdateSpreadsheet(spreadsheetId, requests)
}

/**
 * Creates embedded charts in the Dashboard tab:
 * - Pie chart for asset allocation
 * - Bar chart for asset values
 * Safe to call multiple times - clears existing charts first.
 */
export async function createDashboardCharts(spreadsheetId: string): Promise<void> {
  const sheetMap = await getSheetMap(spreadsheetId)
  const meta = sheetMap.get("Dashboard")
  if (!meta) return

  const sheets = await getSheetsClient()

  // First, remove any existing charts on Dashboard to avoid duplicates
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const dashSheet = spreadsheet.data.sheets?.find(s => s.properties?.sheetId === meta.sheetId)
  const existingCharts = dashSheet?.charts || []

  const deleteRequests: sheets_v4.Schema$Request[] = existingCharts.map(chart => ({
    deleteEmbeddedObject: { objectId: chart.chartId! },
  }))

  if (deleteRequests.length > 0) {
    await batchUpdateSpreadsheet(spreadsheetId, deleteRequests)
  }

  // Create Pie Chart for allocation (data in A8:B10)
  const pieChart: sheets_v4.Schema$Request = {
    addChart: {
      chart: {
        position: {
          overlayPosition: {
            anchorCell: { sheetId: meta.sheetId, rowIndex: 14, columnIndex: 0 },
            widthPixels: 480,
            heightPixels: 300,
          },
        },
        spec: {
          title: "Portfolio Allocation",
          pieChart: {
            legendPosition: "RIGHT_LEGEND",
            domain: {
              sourceRange: {
                sources: [{ sheetId: meta.sheetId, startRowIndex: 7, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 1 }],
              },
            },
            series: {
              sourceRange: {
                sources: [{ sheetId: meta.sheetId, startRowIndex: 7, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 2 }],
              },
            },
            pieHole: 0.4,
          },
          backgroundColor: { red: 1, green: 1, blue: 1 } as sheets_v4.Schema$Color,
          titleTextFormat: { bold: true, fontSize: 14 },
        },
      },
    },
  }

  // Create Bar Chart for asset values (data in A7:B10)
  const barChart: sheets_v4.Schema$Request = {
    addChart: {
      chart: {
        position: {
          overlayPosition: {
            anchorCell: { sheetId: meta.sheetId, rowIndex: 14, columnIndex: 4 },
            widthPixels: 480,
            heightPixels: 300,
          },
        },
        spec: {
          title: "Asset Values (USD)",
          basicChart: {
            chartType: "COLUMN",
            legendPosition: "NO_LEGEND",
            domains: [{
              domain: {
                sourceRange: {
                  sources: [{ sheetId: meta.sheetId, startRowIndex: 7, endRowIndex: 10, startColumnIndex: 0, endColumnIndex: 1 }],
                },
              },
            }],
            series: [{
              series: {
                sourceRange: {
                  sources: [{ sheetId: meta.sheetId, startRowIndex: 7, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 2 }],
                },
              },
              color: { red: 0.15, green: 0.46, blue: 0.84 } as sheets_v4.Schema$Color,
            }],
            axis: [
              { position: "BOTTOM_AXIS", title: "Asset" },
              { position: "LEFT_AXIS", title: "USD Value" },
            ],
          },
          backgroundColor: { red: 1, green: 1, blue: 1 } as sheets_v4.Schema$Color,
          titleTextFormat: { bold: true, fontSize: 14 },
        },
      },
    },
  }

  await batchUpdateSpreadsheet(spreadsheetId, [pieChart, barChart])
  log.info("Dashboard charts created (pie + bar)")
}

/**
 * Updates a connection row in the "Connect to Dapp" tab.
 * Row 2 = instructions (preserved), Row 3+ = active connections.
 */
export async function updateConnectToDappTab(
  spreadsheetId: string,
  connection: {
    connectionId: string
    dappUrl: string
    wcUrl: string
    status: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Connect to Dapp'!A:E",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        connection.connectionId,
        connection.dappUrl,
        connection.wcUrl,
        connection.status,
        new Date().toISOString(),
      ]],
    },
  })
}

/**
 * Marks a WC URI row as processed in the "Connect to Dapp" tab.
 */
export async function markWcUriProcessed(
  spreadsheetId: string,
  row: number,
  connectionId: string,
  status: string,
  dappUrl?: string
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'Connect to Dapp'!A${row}:E${row}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        connectionId,
        dappUrl || "",
        "", // clear WC URL after processing
        status,
        new Date().toISOString(),
      ]],
    },
  })
}

// ── Pending Transactions tab ────────────────────────────────

/**
 * Adds a pending WalletConnect transaction request to the "Pending Transactions" tab.
 * Includes empty checkboxes for approve/reject.
 */
export async function addPendingTransaction(
  spreadsheetId: string,
  request: {
    requestId: string
    connectionId: string
    type: string
    details: string
    status: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Pending Transactions'!A:H",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        request.requestId,
        request.connectionId,
        request.type,
        request.details,
        request.status,
        new Date().toISOString(),
        "FALSE",  // Approve checkbox
        "FALSE",  // Reject checkbox
      ]],
    },
  })
}

/**
 * Updates the status of a pending transaction row after approval/rejection.
 */
export async function updatePendingTransactionStatus(
  spreadsheetId: string,
  row: number,
  status: string
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'Pending Transactions'!E${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[status]] },
  })
}

// ── Chat with Wallet tab ────────────────────────────────────

/**
 * Clears the user input cell after reading the message.
 * Clears both B2 (new layout) and B3 (legacy Code.gs layout) for backward compat.
 */
export async function clearChatInput(spreadsheetId: string): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: "'Chat with Wallet'!B2", values: [[""]] },
        { range: "'Chat with Wallet'!B3", values: [[""]] },
      ],
    },
  })
}

/**
 * Appends a chat message (user or agent) to the Chat History area.
 * Chat history starts at row 5.
 */
export async function appendChatMessage(
  spreadsheetId: string,
  role: "You" | "Agent",
  message: string
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Chat with Wallet'!A5:B500",
    valueInputOption: "RAW",
    requestBody: {
      values: [[role, message]],
    },
  })
}

/**
 * Shows a "Thinking..." indicator in the agent row during processing.
 */
export async function setChatThinking(
  spreadsheetId: string,
  thinking: boolean
): Promise<void> {
  if (!thinking) return // Only set "Thinking...", clear is done by appending the response
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Chat with Wallet'!A5:B500",
    valueInputOption: "RAW",
    requestBody: {
      values: [["Agent", "Thinking..."]],
    },
  })
}

/**
 * Reads chat history for context (last N messages).
 */
export async function readChatHistory(
  spreadsheetId: string,
  limit: number = 20
): Promise<Array<{ role: string; message: string }>> {
  const sheets = await getSheetsClient()
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Chat with Wallet'!A5:B500",
    })
    const rows = res.data.values || []
    const history: Array<{ role: string; message: string }> = []
    for (const row of rows) {
      const role = String(row[0] || "").trim()
      const msg = String(row[1] || "").trim()
      if (role && msg && msg !== "Thinking...") {
        history.push({ role, message: msg })
      }
    }
    return history.slice(-limit)
  } catch {
    return []
  }
}

// ── Agent Logs tab ──────────────────────────────────────────

/**
 * Appends an entry to the "Agent Logs" tab (action, explanation, tx hash, created at).
 */
export async function appendAgentLog(
  spreadsheetId: string,
  action: string,
  explanation: string,
  txHash?: string
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Agent Logs'!A:D",
    valueInputOption: "RAW",
    requestBody: {
      values: [[action, explanation, txHash || "N/A", new Date().toISOString()]],
    },
  })
}

function normalizeTranscriptCell(value: string | undefined): string {
  if (!value) return ""
  return value.replace(/\s+/g, " ").trim().slice(0, 500)
}

function getRowNumberFromUpdatedRange(updatedRange: string | undefined): number | null {
  if (!updatedRange) return null
  const match = updatedRange.match(/![A-Z]+(\d+):[A-Z]+\d+$/)
  if (!match) return null
  return parseInt(match[1], 10)
}

export async function appendExecutionTranscriptRow(
  spreadsheetId: string,
  row: ExecutionTranscriptRow
): Promise<number | null> {
  const sheets = await getSheetsClient()
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Execution Transcript'!A:L",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        row.timestamp,
        row.requestId,
        row.source,
        row.command,
        row.parsedAction,
        row.workflow,
        row.status,
        row.cliCommand,
        normalizeTranscriptCell(row.cliOutput),
        row.txHash,
        row.explorerUrl,
        row.result,
      ]],
    },
  })

  return getRowNumberFromUpdatedRange(response.data.updates?.updatedRange || undefined)
}

export async function updateExecutionTranscriptRow(
  spreadsheetId: string,
  rowNumber: number,
  row: ExecutionTranscriptRow
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'Execution Transcript'!A${rowNumber}:L${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        row.timestamp,
        row.requestId,
        row.source,
        row.command,
        row.parsedAction,
        row.workflow,
        row.status,
        row.cliCommand,
        normalizeTranscriptCell(row.cliOutput),
        row.txHash,
        row.explorerUrl,
        row.result,
      ]],
    },
  })
}

// ── Enriched Portfolio tab ──────────────────────────────────

/**
 * Updates the Portfolio tab with rich formatting:
 * Summary section, Key Metrics, Distribution, Token Holdings.
 */
export async function updatePortfolioTabRich(
  spreadsheetId: string,
  data: {
    walletAddress: string
    network: string
    totalValueUsd: string
    prices?: Record<string, string>
    balances?: Record<string, string>
    timestamp: number
  }
): Promise<void> {
  const sheets = await getSheetsClient()

  const formatPrice = (raw: string | undefined): string => {
    if (!raw || raw === "0") return "N/A"
    const num = Number(BigInt(raw)) / 1e8
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatBalance = (raw: string | undefined, decimals: number): string => {
    if (!raw || raw === "0") return "0"
    const num = Number(BigInt(raw)) / Math.pow(10, decimals)
    return num.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  }

  const computeUsd = (balRaw: string | undefined, priceRaw: string | undefined, decimals: number): number => {
    if (!balRaw || !priceRaw || balRaw === "0" || priceRaw === "0") return 0
    return (Number(BigInt(balRaw)) / Math.pow(10, decimals)) * (Number(BigInt(priceRaw)) / 1e8)
  }

  const prices = data.prices ?? {}
  const balances = data.balances ?? {}
  const totalFormatted = formatPrice(data.totalValueUsd)
  const totalNum = data.totalValueUsd && data.totalValueUsd !== "0" ? Number(BigInt(data.totalValueUsd)) / 1e8 : 0
  const timestamp = new Date(data.timestamp).toISOString()

  // Compute individual values for distribution
  const ethUsd = computeUsd(balances["DOT"], prices["DOT_USD"], 10)
  const usdcUsd = computeUsd(balances["USDT"], prices["USDT_USD"], 6)
  const linkUsd = computeUsd(balances["WETH"], prices["WETH_USD"], 18)

  const pctOf = (val: number) => totalNum > 0 ? `${((val / totalNum) * 100).toFixed(2)}%` : "0.00%"

  // Token count
  let tokenCount = 0
  if (ethUsd > 0) tokenCount++
  if (usdcUsd > 0) tokenCount++
  if (linkUsd > 0) tokenCount++

  const values = [
    ["Portfolio", "", "", "", "", "", "", new Date(data.timestamp).toISOString()],
    [],
    ["Summary"],
    ["Wallet Address", data.walletAddress, "", "Total Balance (USD)", totalFormatted],
    ["Network", data.network, "", "24h Change", "0.00%"],
    ["Last Updated", timestamp, "", "30d Change", "0.00%"],
    [],
    ["Key Metrics"],
    ["DOT Balance", "", "Token Count", "", "Networks", "", "DeFi Protocols"],
    [formatBalance(balances["DOT"], 10), "", String(tokenCount), "", data.network, "", "N/A"],
    [],
    ["Distribution"],
    ["Asset", "Value (USD)", "% of Portfolio"],
    ["DOT", `$${ethUsd.toFixed(2)}`, pctOf(ethUsd)],
    ["USDT", `$${usdcUsd.toFixed(2)}`, pctOf(usdcUsd)],
    ["WETH", `$${linkUsd.toFixed(2)}`, pctOf(linkUsd)],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    ["Token Holdings"],
    ["Token", "Symbol", "Balance", "USD Value", "Price (USD)", "24h Change", "7d Change", "Actions"],
    [
      "Polkadot", "DOT", formatBalance(balances["DOT"], 10),
      `$${ethUsd.toFixed(2)}`, formatPrice(prices["DOT_USD"]),
      "—", "—", "View on Explorer",
    ],
    [
      "Tether USD", "USDT", formatBalance(balances["USDT"], 6),
      `$${usdcUsd.toFixed(2)}`, formatPrice(prices["USDT_USD"]),
      "—", "—", "View on Explorer",
    ],
    [
      "Wrapped Ether", "WETH", formatBalance(balances["WETH"], 18),
      `$${linkUsd.toFixed(2)}`, formatPrice(prices["WETH_USD"]),
      "—", "—", "View on Explorer",
    ],
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'View Transactions'!A1:H35",
    valueInputOption: "RAW",
    requestBody: { values },
  })

  await formatViewTransactionsTab(spreadsheetId)

  log.info("View Transactions tab updated (rich format)", { total: totalFormatted })
}

async function formatPrimaryExperienceTabs(spreadsheetId: string): Promise<void> {
  await formatSettingsTab(spreadsheetId)
  await formatViewTransactionsTab(spreadsheetId)
  await formatConnectToDappTab(spreadsheetId)
  await formatPendingTransactionsTab(spreadsheetId)
  await formatChatWithWalletTab(spreadsheetId)
  await formatAgentLogsTab(spreadsheetId)
}

async function formatSettingsTab(spreadsheetId: string): Promise<void> {
  const meta = (await getSheetMap(spreadsheetId)).get("Settings")
  if (!meta) return

  await batchUpdateSpreadsheet(spreadsheetId, [
    { unmergeCells: { range: { sheetId: meta.sheetId, startRowIndex: 9, endRowIndex: 12, startColumnIndex: 1, endColumnIndex: 4 } } },
    { mergeCells: { range: { sheetId: meta.sheetId, startRowIndex: 9, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: "MERGE_ALL" } },
    { mergeCells: { range: { sheetId: meta.sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: "MERGE_ALL" } },
    { mergeCells: { range: { sheetId: meta.sheetId, startRowIndex: 11, endRowIndex: 12, startColumnIndex: 1, endColumnIndex: 4 }, mergeType: "MERGE_ALL" } },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.sage, textFormat: { bold: true, foregroundColor: COLORS.ink }, horizontalAlignment: "LEFT" } },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 2 },
        cell: { userEnteredFormat: { borders: { top: { style: "SOLID", color: COLORS.fog }, bottom: { style: "SOLID", color: COLORS.fog }, left: { style: "SOLID", color: COLORS.fog }, right: { style: "SOLID", color: COLORS.fog } } } },
        fields: "userEnteredFormat.borders",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 9, endRowIndex: 12, startColumnIndex: 1, endColumnIndex: 4 },
        cell: { userEnteredFormat: { horizontalAlignment: "CENTER", textFormat: { foregroundColor: COLORS.ink, fontSize: 12 } } },
        fields: "userEnteredFormat(horizontalAlignment,textFormat)",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 10, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 4 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 20, foregroundColor: COLORS.ink } } },
        fields: "userEnteredFormat.textFormat",
      },
    },
  ])
}

async function formatViewTransactionsTab(spreadsheetId: string): Promise<void> {
  const meta = (await getSheetMap(spreadsheetId)).get("View Transactions")
  if (!meta) return

  const sectionRows = [0, 2, 7, 11, 26]
  const requests: sheets_v4.Schema$Request[] = [
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.sage, textFormat: { bold: true, fontSize: 14, foregroundColor: COLORS.ink } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
  ]

  for (const rowIndex of sectionRows) {
    requests.push({
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 8 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.sage, textFormat: { bold: true, foregroundColor: COLORS.ink } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    })
  }

  requests.push(
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 12, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 3 },
        cell: { userEnteredFormat: { borders: { top: { style: "SOLID", color: COLORS.fog }, bottom: { style: "SOLID", color: COLORS.fog }, left: { style: "SOLID", color: COLORS.fog }, right: { style: "SOLID", color: COLORS.fog } } } },
        fields: "userEnteredFormat.borders",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 27, endRowIndex: 35, startColumnIndex: 0, endColumnIndex: 8 },
        cell: { userEnteredFormat: { borders: { top: { style: "SOLID", color: COLORS.fog }, bottom: { style: "SOLID", color: COLORS.fog }, left: { style: "SOLID", color: COLORS.fog }, right: { style: "SOLID", color: COLORS.fog } } } },
        fields: "userEnteredFormat.borders",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 27, endRowIndex: 28, startColumnIndex: 0, endColumnIndex: 8 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.mint, textFormat: { bold: true } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
  )

  await batchUpdateSpreadsheet(spreadsheetId, requests)
}

async function formatConnectToDappTab(spreadsheetId: string): Promise<void> {
  const meta = (await getSheetMap(spreadsheetId)).get("Connect to Dapp")
  if (!meta) return

  await batchUpdateSpreadsheet(spreadsheetId, [
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.sage, textFormat: { bold: true, foregroundColor: COLORS.ink } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 5 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.blush, wrapStrategy: "WRAP", verticalAlignment: "TOP" } },
        fields: "userEnteredFormat(backgroundColor,wrapStrategy,verticalAlignment)",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 5 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.blush, wrapStrategy: "WRAP", textFormat: { fontSize: 9 } } },
        fields: "userEnteredFormat(backgroundColor,wrapStrategy,textFormat)",
      },
    },
  ])
}

async function formatPendingTransactionsTab(spreadsheetId: string): Promise<void> {
  const meta = (await getSheetMap(spreadsheetId)).get("Pending Transactions")
  if (!meta) return

  await batchUpdateSpreadsheet(spreadsheetId, [
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.sage, textFormat: { bold: true, foregroundColor: COLORS.ink } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 6, endColumnIndex: 8 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.cream, textFormat: { fontSize: 9 }, horizontalAlignment: "CENTER", wrapStrategy: "WRAP" } },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 40, startColumnIndex: 3, endColumnIndex: 4 },
        cell: { userEnteredFormat: { wrapStrategy: "WRAP" } },
        fields: "userEnteredFormat.wrapStrategy",
      },
    },
  ])
}

async function formatChatWithWalletTab(spreadsheetId: string): Promise<void> {
  const meta = (await getSheetMap(spreadsheetId)).get("Chat with Wallet")
  if (!meta) return

  await batchUpdateSpreadsheet(spreadsheetId, [
    { unmergeCells: { range: { sheetId: meta.sheetId, startRowIndex: 1, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 6 } } },
    { mergeCells: { range: { sheetId: meta.sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: "MERGE_ALL" } },
    { mergeCells: { range: { sheetId: meta.sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 2, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
    { mergeCells: { range: { sheetId: meta.sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: "MERGE_ALL" } },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.sage, textFormat: { bold: true, foregroundColor: COLORS.ink } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.sage, textFormat: { bold: true, foregroundColor: COLORS.ink } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 5, endRowIndex: 12, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.blush, wrapStrategy: "WRAP", verticalAlignment: "TOP" } },
        fields: "userEnteredFormat(backgroundColor,wrapStrategy,verticalAlignment)",
      },
    },
  ])
}

async function formatAgentLogsTab(spreadsheetId: string): Promise<void> {
  const meta = (await getSheetMap(spreadsheetId)).get("Agent Logs")
  if (!meta) return

  await batchUpdateSpreadsheet(spreadsheetId, [
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
        cell: { userEnteredFormat: { backgroundColor: COLORS.sage, textFormat: { bold: true, foregroundColor: COLORS.ink } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
  ])
}

// ── DeFi tab helpers ─────────────────────────────────────────────────────────

/**
 * Appends a yield farming position row to the "Yield Farming" tab.
 */
export async function appendYieldFarmingRow(
  spreadsheetId: string,
  position: {
    protocol: string
    pool: string
    tokenA: string
    tokenB: string
    stakedAmountUsd: number
    apy: number
    dailyRewardsUsd: number
    totalEarnedUsd: number
    rewardToken: string
    riskLevel: string
    chain: string
    txHash?: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Yield Farming'!A:L",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        position.protocol,
        position.pool,
        position.tokenA,
        position.tokenB,
        `$${position.stakedAmountUsd.toFixed(2)}`,
        `${position.apy.toFixed(2)}%`,
        `$${position.dailyRewardsUsd.toFixed(4)}`,
        `$${position.totalEarnedUsd.toFixed(4)}`,
        position.rewardToken,
        position.riskLevel,
        position.chain,
        new Date().toISOString(),
      ]],
    },
  })
}

/**
 * Appends a staking position row to the "Staking" tab.
 */
export async function appendStakingRow(
  spreadsheetId: string,
  position: {
    protocol: string
    token: string
    amount: number
    apr: number
    status: string
    txHash?: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Staking'!A:L",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        position.protocol,
        `${position.protocol} Pool`,
        position.token,
        `${position.amount} ${position.token}`,
        "$—",
        `${position.apr.toFixed(2)}%`,
        "0",
        "$0.00",
        "0",
        position.status,
        "Polkadot Hub",
        new Date().toISOString(),
      ]],
    },
  })
}

/**
 * Appends a liquidity provision row to the "Liquidity Pools" tab.
 */
export async function appendLiquidityRow(
  spreadsheetId: string,
  position: {
    protocol: string
    pair: string
    amountA: number
    amountB: number
    totalValueUsd: number
    apy: number
    txHash?: string
  }
): Promise<void> {
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Liquidity Pools'!A:N",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        position.protocol,
        position.pair,
        position.amountA,
        position.amountB,
        `$${position.totalValueUsd.toFixed(2)}`,
        "—",
        "$—",
        "—",
        "$0.00",
        "$0.00",
        `${position.apy.toFixed(2)}%`,
        "YES",
        "Polkadot Hub",
        new Date().toISOString(),
      ]],
    },
  })
}

/**
 * Updates the DeFi Summary tab with aggregate data.
 */
export async function updateDeFiSummaryTab(
  spreadsheetId: string,
  summary: {
    totalYieldFarmingUsd: number
    totalStakingUsd: number
    totalLiquidityUsd: number
    totalPortfolioUsd: number
    totalDailyRewardsUsd: number
    totalUnclaimedRewardsUsd: number
    weightedAvgApy: number
    positions: { yieldFarming: number; staking: number; liquidity: number }
  }
): Promise<void> {
  const sheets = await getSheetsClient()
  const now = new Date().toISOString()

  const dailyYfUsd = (summary.totalYieldFarmingUsd * 8.0) / 100 / 365
  const dailySkUsd = (summary.totalStakingUsd * 5.3) / 100 / 365

  const values = [
    ["CATEGORY", "TOTAL VALUE (USD)", "POSITIONS", "DAILY REWARDS (USD)", "UNCLAIMED REWARDS (USD)", "AVG APY %", "LAST UPDATED"],
    [
      "Yield Farming",
      `$${summary.totalYieldFarmingUsd.toFixed(2)}`,
      summary.positions.yieldFarming,
      `$${dailyYfUsd.toFixed(4)}`,
      `$${(dailyYfUsd * 14).toFixed(4)}`,
      "8.00%",
      now,
    ],
    [
      "Staking",
      `$${summary.totalStakingUsd.toFixed(2)}`,
      summary.positions.staking,
      `$${dailySkUsd.toFixed(4)}`,
      `$${(dailySkUsd * 30).toFixed(4)}`,
      "5.30%",
      now,
    ],
    [
      "Liquidity Pools",
      `$${summary.totalLiquidityUsd.toFixed(2)}`,
      summary.positions.liquidity,
      `$${summary.totalDailyRewardsUsd.toFixed(4)}`,
      `$${summary.totalUnclaimedRewardsUsd.toFixed(4)}`,
      `${summary.weightedAvgApy.toFixed(2)}%`,
      now,
    ],
    ["", "", "", "", "", "", ""],
    [
      "TOTAL DEFI",
      `$${summary.totalPortfolioUsd.toFixed(2)}`,
      summary.positions.yieldFarming + summary.positions.staking + summary.positions.liquidity,
      `$${summary.totalDailyRewardsUsd.toFixed(4)}`,
      `$${summary.totalUnclaimedRewardsUsd.toFixed(4)}`,
      `${summary.weightedAvgApy.toFixed(2)}%`,
      now,
    ],
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'DeFi Summary'!A1:G6",
    valueInputOption: "RAW",
    requestBody: { values },
  })

  log.info("DeFi Summary tab updated", { total: summary.totalPortfolioUsd.toFixed(2) })
}

// ── Privacy status ────────────────────────────────────────────────────────

/**
 * Write privacy status to the Settings tab.
 * Shows which data is protected and what mode is active.
 */
export async function updatePrivacyStatusInSheet(
  spreadsheetId: string
): Promise<void> {
  try {
    const sheets = await getSheetsClient()

    const privacyRows = [
      ["", ""],
      ["🔒 PRIVACY STATUS", ""],
      ["Mode", "Sheets-only"],
      ["Encryption Enabled", "○ Not configured"],
      ["Wallet Key Storage", "Disabled"],
      ["Privacy Mode", "OFF"],
      ["Protected Fields", "None"],
      ["Private Trade (TEE)", "○ Not available"],
    ]

    await withRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "'Settings'!A:B",
        valueInputOption: "RAW",
        requestBody: { values: privacyRows },
      })
    )
  } catch {
    // Non-critical — don't break startup
  }
}

/**
 * Append an encrypted trade record marker to the Agent Logs tab.
 * Used to demonstrate that sensitive data is encrypted in Nillion.
 */
export async function appendEncryptedTradeMarker(
  spreadsheetId: string,
  tradeRef: string,
  encryptedFields: string[]
): Promise<void> {
  try {
    const sheets = await getSheetsClient()
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "'Agent Logs'!A:D",
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          new Date().toISOString(),
          "privacy_encrypt",
          `🔒 Encrypted fields for ${tradeRef}: ${encryptedFields.join(", ")}`,
          "Disabled in sheets-only mode",
        ]],
      },
    })
  } catch {
    // Non-critical
  }
}
