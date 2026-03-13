# SheetFra — Your Spreadsheet as a Polkadot DeFi Control Plane

**Polkadot Solidity Hackathon 2026 | Track 1: EVM Smart Contract — DeFi & AI-powered dApps**

---

## What is SheetFra?

SheetFra turns Google Sheets into a fully functional DeFi control plane on Polkadot Hub. Users manage portfolios, stage trades, and enforce risk rules directly from a spreadsheet interface they already know, powered by Gemini AI for natural-language interaction. No custom frontend required — your spreadsheet _is_ the dApp.

---

## Architecture

```
Google Sheet  <-->  Apps Script (Code.gs)  <-->  SheetFra Agent (Express.js)  <-->  Polkadot Hub EVM
     |                    |                              |                              |
  Portfolio View     HTTP Requests              Gemini AI Chat Engine        SheetFraRegistry.sol
  Trade Staging      Sheet Read/Write           Google Sheets API            OpenZeppelin Contracts
  Risk Rules         Sidebar UI                 Trade Execution              DOT / USDT / WETH
```

1. **Google Sheet** — The user-facing interface for portfolio data, pending trades, risk parameters, and chat.
2. **Apps Script (Code.gs)** — Bridges the spreadsheet to the SheetFra backend via HTTP calls and provides the sidebar UI.
3. **SheetFra Agent (Express.js / TypeScript)** — Core backend that processes AI chat, reads/writes sheet data, and submits transactions.
4. **Polkadot Hub EVM** — On-chain execution layer where SheetFraRegistry.sol manages asset registration, approvals, and swaps.

---

## Features

- **AI-powered chat (Gemini 2.0 Flash)** — Ask questions and issue DeFi commands in plain English. The agent interprets intent, validates parameters, and stages transactions.
- **Spreadsheet-native portfolio view, trade staging, and risk rules** — See balances, queue trades, and set limits without leaving Google Sheets.
- **Smart contract registry (SheetFraRegistry.sol)** — Built with OpenZeppelin for upgradeable, auditable on-chain logic including asset whitelisting and trade settlement.
- **Support for DOT, USDT, and WETH on Polkadot Hub** — Core asset coverage for the Polkadot Hub EVM ecosystem out of the box.
- **Approve-before-execute flow** — Every trade is staged in the sheet first. Users review, then explicitly approve before any on-chain transaction is submitted.

---

## Tech Stack

| Layer            | Technology                              |
| ---------------- | --------------------------------------- |
| Backend          | Express.js, TypeScript, Node.js 18+     |
| Spreadsheet      | Google Sheets API, Google Apps Script    |
| AI               | Gemini 2.0 Flash (Google AI)            |
| Smart Contracts  | Solidity, Hardhat, OpenZeppelin         |
| Blockchain       | Polkadot Hub EVM (PAS Testnet)          |
| Wallet Support   | Talisman, SubWallet                     |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Google Cloud Service Account with Sheets API enabled
- Gemini API key
- PAS testnet tokens from [faucet.polkadot.io](https://faucet.polkadot.io)

### Backend Setup

```bash
# Clone the repository
git clone https://github.com/your-org/sheetfra.git
cd sheetfra

# Install dependencies
cd sheets-agent && npm install

# Configure environment
cp .env.example .env
# Fill in all required values (see Environment Variables below)

# Share your Google Sheet with the service account email
# (the email found in your service account JSON key file)

# Start the development server
npm run dev
```

### Google Sheets Setup

1. Open your Google Sheet.
2. Go to **Extensions > Apps Script**.
3. Copy the contents of `Code.gs` into the Apps Script editor.
4. Save and reload the sheet.

---

## Smart Contract

```bash
cd contracts && npm install

# Compile contracts
npm run compile

# Deploy to Polkadot Hub EVM testnet
npm run deploy
```

After deployment, the contract address will be printed to the console. Verify and inspect it on [Blockscout](https://blockscout.polkadot.io) for the Polkadot Hub EVM explorer.

---

## Environment Variables

| Variable                          | Description                                              |
| --------------------------------- | -------------------------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to the Google Cloud service account JSON key file   |
| `GOOGLE_SHEET_ID`                 | ID of the target Google Sheet (from the sheet URL)       |
| `GEMINI_API_KEY`                  | API key for Google Gemini AI                             |
| `POLKADOT_HUB_RPC_URL`           | RPC endpoint for Polkadot Hub EVM (testnet or mainnet)   |
| `SHEETFRA_API_KEY`               | Secret key used to authenticate Apps Script requests     |

---

## Demo Flow

1. **Open the Google Sheet** — Navigate to your configured SheetFra spreadsheet.
2. **Connect your wallet** — Use Talisman or SubWallet to connect to Polkadot Hub EVM.
3. **View your portfolio** — Balances for DOT, USDT, and WETH populate automatically.
4. **Chat with the AI** — Type a command like `"swap 10 USDT for DOT"` in the chat sidebar.
5. **Review the staged trade** — The trade appears in the **Pending Trades** tab with full details.
6. **Approve the trade** — Click approve to authorize on-chain execution.
7. **View the transaction** — Confirm the result on Blockscout with the provided transaction hash.

---

## Roadmap

| Timeline | Milestone                                                        |
| -------- | ---------------------------------------------------------------- |
| Q2 2026  | XCM parachain asset support — bridge and manage cross-chain tokens |
| Q3 2026  | DOT staking directly from the sheet, Bifrost vDOT integration    |
| Q4 2026  | DAO workspace templates — multi-sig treasury management in Sheets |

---

## License

This project is licensed under the [MIT License](LICENSE).
