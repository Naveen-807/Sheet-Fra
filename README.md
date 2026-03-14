# SheetFra

> **Your spreadsheet IS the Polkadot DeFi control plane.**

**TL;DR:** [Demo Video](#demo-materials) | [Live Sheet Template](#quick-start) | [Architecture](#architecture)

---

## Problem

Treasurers and DAOs live in spreadsheets. DeFi lives in browser extensions and custom frontends. The result: finance teams copy-paste between sheets and dApps, lose audit trails, and can't enforce risk rules where they already work. No existing Polkadot tool bridges this gap.

## Solution

SheetFra embeds Polkadot Hub DeFi directly into Google Sheets. Users manage portfolios, stage trades via AI chat, enforce risk limits, and verify every action on-chain — all without leaving their spreadsheet. Gemini AI interprets natural-language commands; OpenZeppelin-secured contracts provide an immutable audit trail; and the XCM precompile enables cross-chain visibility.

---

## SheetFra vs Traditional dApp

| | **SheetFra** | **Traditional dApp** |
|---|---|---|
| **Interface** | Google Sheets (already open) | Custom web app / browser extension |
| **Learning curve** | Zero — everyone knows spreadsheets | High — new UI per protocol |
| **Approval flow** | Cell-based: review in sheet, then approve | Transaction popup with hex data |
| **Audit trail** | Sheet history + on-chain registry | On-chain only |
| **AI assistant** | Built-in Gemini chat in the sheet | None or separate tool |
| **Risk rules** | Editable in a sheet tab | Hard-coded or absent |
| **Multi-user** | Google Sheets sharing & permissions | Wallet-level only |

---

## Track & Sponsor Fit

### Track 1: EVM Smart Contract — DeFi & AI-powered dApps
- **AI-powered dApp**: Gemini 2.0 Flash processes natural-language DeFi commands with structured JSON output, portfolio context, and trade intent extraction
- **DeFi / Stablecoin**: USDT-first treasury management with stablecoin reserve monitoring, swap staging, risk guardrails, and portfolio rebalancing on Polkadot Hub
- **OpenZeppelin**: `SheetFraRegistry.sol` uses `Ownable`, `ReentrancyGuard`, `Pausable` for on-chain audit logging of every sheet action

### Track 2: PVM — Precompiles & Polkadot Native
- **XCM Precompile**: `SheetFraXcmBridge.sol` calls the XCM precompile at `0xA0000` for cross-chain message weighing and execution — Solidity talking directly to Polkadot's core interoperability primitive
- **Polkadot Native Assets**: Portfolio displays DOT (native), USDT, and WETH with Polkadot Hub asset awareness
- **Precompile integration**: Direct use of `weighMessage()` and `execute()` from the XCM precompile interface

---

## Features

- **AI chat (Gemini 2.0 Flash)** — Natural-language DeFi commands: "swap 10 USDT for DOT", "what's my stablecoin reserve?", "rebalance to 40% USDT"
- **Spreadsheet-native portfolio** — Live balances for DOT, USDT, WETH from Polkadot Hub, displayed in familiar sheet format
- **Approve-before-execute** — Every trade is staged in a Pending Trades tab; user reviews and explicitly approves before on-chain execution
- **Risk guardrails** — Configurable slippage limits, daily volume caps, trade cooldowns, concentration limits, minimum stablecoin reserve — all editable in a sheet tab
- **Stablecoin Reserve monitoring** — Dedicated tab tracking USDT/USDC reserves against target thresholds with alerts
- **On-chain audit log** — `SheetFraRegistry.sol` records every swap/stake/approve/XCM action with sheet-to-wallet linkage
- **XCM cross-chain bridge** — `SheetFraXcmBridge.sol` enables cross-chain asset visibility and operations via Polkadot XCM precompile
- **Custom sheet formulas** — `=CRE_PRICE("DOT/USD")`, `=CRE_BALANCE("DOT")`, `=CRE_TRADE("swap 50 USDT for WETH")`
- **Wallet sidebar** — Dark-themed dashboard in Google Sheets sidebar with portfolio overview and quick actions
- **Export** — CSV/JSON export of trades and portfolio history

---

## Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Google Sheet    │────▶│  Apps Script         │────▶│  SheetFra Agent      │────▶│  Polkadot Hub EVM   │
│                  │◀────│  (Code.gs)           │◀────│  (Express.js / TS)   │◀────│                     │
├─────────────────┤     ├─────────────────────┤     ├──────────────────────┤     ├─────────────────────┤
│ Portfolio View   │     │ Custom Formulas      │     │ Gemini 2.0 Flash AI  │     │ SheetFraRegistry    │
│ Chat with Wallet │     │ CRE_PRICE/BALANCE    │     │ Google Sheets API    │     │  (OpenZeppelin)     │
│ Pending Trades   │     │ Sidebar UI           │     │ Trade Staging Engine  │     │ SheetFraXcmBridge   │
│ Risk Rules       │     │ HTTP → Agent         │     │ Risk Guardrails      │     │  (XCM precompile)   │
│ Stablecoin Res.  │     │                     │     │ Execution Ledger     │     │ DOT / USDT / WETH   │
│ XCM / Cross-Chain│     │                     │     │                      │     │                     │
└─────────────────┘     └─────────────────────┘     └──────────────────────┘     └─────────────────────┘
```

**Data flow:** User types in sheet → Apps Script forwards to Agent → Agent processes via Gemini AI → Stages trade in sheet → User approves → Agent executes on Polkadot Hub → Registry logs action on-chain → Sheet updates with result

---

## Code Structure

```
sheetfra/
├── sheets-agent/               # Core backend (Express.js + TypeScript)
│   ├── src/
│   │   ├── index.ts            # Server entry, env validation, startup
│   │   ├── config/
│   │   │   └── polkadot-hub.ts # Chain config (RPC, chainId, tokens)
│   │   ├── services/
│   │   │   ├── gemini.ts       # Gemini 2.0 Flash: structured JSON, trade intent
│   │   │   ├── chat.ts         # Chat router: slash commands → Gemini → staging
│   │   │   ├── sheets.ts       # Google Sheets API: auth, CRUD, template setup
│   │   │   └── executionLedger.ts  # Execution transcript tracking
│   │   ├── routes/
│   │   │   ├── sheetWatcher.ts # Adaptive polling (10s active / 20s idle)
│   │   │   ├── guardrails.ts   # Risk enforcement engine
│   │   │   └── api.ts          # REST API routes
│   │   ├── middleware/
│   │   │   ├── webhookAuth.ts  # HMAC-SHA256 + bearer token auth
│   │   │   ├── rateLimit.ts    # In-memory rate limiter
│   │   │   └── validate.ts     # Input validation
│   │   └── utils/              # Logger, cache, error handling
│   └── package.json
│
├── contracts/                  # Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── SheetFraRegistry.sol    # On-chain audit log (OpenZeppelin)
│   │   └── SheetFraXcmBridge.sol   # XCM precompile bridge (Track 2)
│   ├── scripts/
│   │   └── deploy.ts               # Dual deploy to Polkadot Hub
│   ├── test/
│   │   └── SheetFraRegistry.test.ts
│   └── hardhat.config.ts           # Polkadot Hub Testnet target
│
└── google-apps-script/         # Google Sheets integration
    ├── Code.gs                 # Custom formulas, sidebar, menus
    └── appsscript.json         # GAS manifest
```

---

## Demo Flow

1. **Open the Google Sheet** — The agent auto-creates 20+ tabs with formatting on startup
2. **View portfolio** — DOT, USDT, WETH balances populate in the View Transactions tab
3. **Chat with AI** — Type "swap 10 USDT for DOT" in the Chat with Wallet tab
4. **Review staged trade** — Trade appears in Pending Trades with full details (pair, amount, slippage)
5. **Approve** — Change STATUS to APPROVED to authorize execution
6. **On-chain audit** — SheetFraRegistry logs the action; explorer link appears in sheet
7. **Check stablecoin reserve** — Stablecoin Reserve tab shows reserve status against risk rules
8. **XCM visibility** — XCM / Cross-Chain tab shows cross-chain asset status via precompile

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Express.js, TypeScript, Node.js 18+ |
| Spreadsheet | Google Sheets API, Google Apps Script |
| AI | Gemini 2.0 Flash (structured JSON output) |
| Smart Contracts | Solidity 0.8.24, Hardhat, OpenZeppelin v5 |
| Blockchain | Polkadot Hub EVM (PAS Testnet, chain 420420417) |
| XCM | XCM precompile at `0xA0000` |
| Wallet Support | Talisman, SubWallet (EVM-compatible) |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Google Cloud Service Account with Sheets API + Drive API enabled
- Gemini API key ([ai.google.dev](https://ai.google.dev))
- PAS testnet tokens from [faucet.polkadot.io](https://faucet.polkadot.io)

### 1. Backend

```bash
cd sheets-agent && npm install
cp .env.example .env
# Fill in: GOOGLE_SERVICE_ACCOUNT_KEY_PATH, GEMINI_API_KEY
# Share a Google Sheet with your service account email (Editor access)
npm run dev
```

### 2. Google Apps Script

1. Open your Google Sheet → Extensions → Apps Script
2. Paste contents of `google-apps-script/Code.gs`
3. Set Script Properties: `AGENT_URL` = your server URL, `SHEETFRA_API_KEY` = your API key
4. Save and reload the sheet

### 3. Smart Contracts

```bash
cd contracts && npm install
npm run compile
npm run deploy    # Deploys SheetFraRegistry + SheetFraXcmBridge to Polkadot Hub
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to Google Cloud service account JSON key |
| `GEMINI_API_KEY` | Google Gemini AI API key |
| `GOOGLE_SHEET_ID` | Target spreadsheet ID (auto-detected if not set) |
| `SHEETFRA_API_KEY` | API key for Apps Script ↔ Agent auth |
| `POLKADOT_HUB_RPC_URL` | RPC endpoint (defaults to Polkadot Hub Testnet) |

---

## Demo Materials

1. Demo Video — *Recording in progress*
2. [GitHub Repository](https://github.com/your-org/sheetfra)
3. Presentation — *Slides in progress*

---

## Roadmap

| Timeline | Milestone |
|---|---|
| Q2 2026 | XCM parachain asset transfers from sheet, multi-chain portfolio |
| Q3 2026 | DOT staking from sheet, Bifrost vDOT integration |
| Q4 2026 | DAO workspace templates — multi-sig treasury management in Sheets |
| 2027 | Mainnet launch, Polkadot governance participation from sheet |

---

## Team

| Name | Role |
|---|---|
| *Add team members* | *Add roles* |

---

## License

MIT
