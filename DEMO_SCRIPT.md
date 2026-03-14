# SheetFra Demo Script — 3-5 Minute Walkthrough

**Target audience:** Hackathon judges evaluating Track 1 (EVM) and Track 2 (PVM).

---

## Pre-Demo Checklist

- [ ] Backend running (`cd sheets-agent && npm run dev`)
- [ ] Google Sheet open in browser (full screen, zoom 100%)
- [ ] JUDGE_MODE=true in .env (seeds demo data)
- [ ] Gemini API key working (test with a quick chat message)
- [ ] Backup: 3-min screen recording ready if live demo fails
- [ ] Have this script visible on a second screen / printed

---

## Act 1: The Hook (0:00–0:30)

**Say:**

> "Most DeFi lives in browser extensions and custom web apps. But treasurers and DAOs already live in spreadsheets. SheetFra puts Polkadot DeFi where they already work — directly in Google Sheets."

**Show:**

1. Google Sheet is already open — clean, formatted tabs visible
2. Point to the tabs: "View Transactions, Chat with Wallet, Risk Rules, Stablecoin Reserve, XCM / Cross-Chain"
3. Click **View Transactions** — show the live portfolio: DOT, USDT, WETH with prices and allocations

**Key line:** "No custom frontend. The spreadsheet IS the dApp."

---

## Act 2: The Magic — AI Chat (0:30–2:00)

**Show:**

1. Click the **Chat with Wallet** tab
2. Type: `What's my portfolio?`
3. Wait for Gemini response — it shows portfolio breakdown with live context
4. **Key moment:** "This is Gemini 2.0 Flash, with full Polkadot context — it knows about Hydration, Bifrost, Snowbridge, and our risk rules."

5. Type: `swap 10 USDT for DOT`
6. Show the AI response — it stages the trade and mentions the approval flow
7. Click **Pending Trades** tab — show the staged trade with status "PENDING"
8. **Key line:** "Every trade goes through approve-before-execute. The user reviews in the sheet, then approves. No surprise transactions."

9. Click **Agent Logs** tab — show the registry_action entry
10. **Key line:** "And every action is logged to SheetFraRegistry on-chain — an immutable audit trail linking this sheet to the wallet."

---

## Act 3: Stablecoin & Risk (2:00–3:00)

**Show:**

1. Click **Stablecoin Reserve** tab
2. Show: USDT balance, reserve %, health status
3. **Say:** "USDT is our primary stablecoin on Polkadot Hub. We track reserve levels against configurable thresholds."

4. Type in chat: `/reserve`
5. Show the reserve status response

6. Click **Risk Rules** tab
7. Show configurable rules: slippage, cooldown, daily volume, min stable reserve
8. **Say:** "All risk rules are editable right here in the sheet. The AI and execution engine enforce them automatically."

---

## Act 4: Track 2 — XCM & Polkadot Native (3:00–4:00)

**Show:**

1. Click **XCM / Cross-Chain** tab
2. Show: XCM precompile address (0xA0000), capabilities, connected chains
3. **Say:** "For Track 2, we built SheetFraXcmBridge.sol. It uses the XCM precompile at 0xA0000 — that's Solidity talking directly to Polkadot's core interoperability primitive."

4. Type in chat: `/xcm`
5. Show the XCM status response

6. **Say:** "weighMessage estimates cross-chain costs. execute runs XCM messages. This lets the spreadsheet drive cross-chain operations — Hydration swaps, Bifrost staking, Snowbridge bridging."

---

## Act 5: Smart Contracts (4:00–4:30)

**Show (can be code / terminal):**

1. Show `SheetFraRegistry.sol` briefly — OpenZeppelin imports (Ownable, ReentrancyGuard, Pausable)
2. Show `registerAction()` — "Every swap, stake, or XCM action is registered on-chain"
3. Show `SheetFraXcmBridge.sol` — "Uses IXcm interface to call the precompile"
4. **Say:** "Both contracts are deployed to Polkadot Hub Testnet. Verifiable on Blockscout."

---

## Closing (4:30–5:00)

**Say:**

> "SheetFra: your spreadsheet as a Polkadot DeFi control plane."
>
> "For Track 1: AI-powered dApp with Gemini, DeFi and stablecoin management, OpenZeppelin contracts."
>
> "For Track 2: XCM precompile integration, Polkadot native asset awareness, cross-chain visibility."
>
> "No other project puts DeFi in a spreadsheet on Polkadot. Treasurers already live here — we bring Polkadot to them."

---

## If Things Go Wrong

| Problem | Recovery |
|---------|----------|
| Gemini API slow/down | Use slash commands: `/status`, `/risk`, `/reserve`, `/xcm` — all work without AI |
| Sheet not updating | Refresh the page; agent auto-reconnects in 10-20s |
| Live demo fails | Switch to pre-recorded backup video |
| Portfolio shows $0 | Explain: "We're on testnet — let me show the demo data" → set JUDGE_MODE=true |

---

## One-Liner for Judges

> **SHEETFRA** — Spreadsheet as Polkadot DeFi Control Plane.
> Track 1 (EVM): AI + DeFi + Stablecoin + OpenZeppelin.
> Track 2 (PVM): XCM precompile + Polkadot native.
> Unique: No other project puts DeFi in a spreadsheet on Polkadot.
