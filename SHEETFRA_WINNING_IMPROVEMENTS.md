# SheetFra — Judge-Winning Improvements for Both Tracks

**Goal:** Maximize chances of winning **Track 1 (EVM)** and **Track 2 (PVM)** in the Polkadot Solidity Hackathon 2026.

---

## What's Been Added (Implementation Status)

| Component | Status | Location |
|-----------|--------|----------|
| **SheetFraRegistry** + `registerAction()` | ✅ Done | `contracts/contracts/SheetFraRegistry.sol` |
| **SheetFraXcmBridge** (XCM precompile) | ✅ Done | `contracts/contracts/SheetFraXcmBridge.sol` |
| **Dual deploy script** | ✅ Done | `contracts/scripts/deploy.ts` |
| Polkadot-aware AI (Gemini) | ✅ Already in place | `sheets-agent/src/services/gemini.ts` |
| `/polkadot`, `/hub-status`, `/dot-price` | ✅ Already in place | `sheets-agent/src/services/chat.ts` |

---

## Part 1: Judge Psychology — What Makes Them Say "Wow"

### What Judges Remember After 50+ Demos

| Factor | Impact | SheetFra Angle |
|--------|--------|----------------|
| **"I've never seen that before"** | Very high | Spreadsheet as DeFi UI — unique in Polkadot ecosystem |
| **"This uses Polkadot differently"** | High | XCM precompile in a treasury tool; native assets in sheets |
| **"I could use this tomorrow"** | High | Treasurers, DAOs, teams already use spreadsheets |
| **"Technical depth + accessible"** | High | AI + precompiles + familiar UX |
| **"Clear path to production"** | Medium | Roadmap, mainnet, grants |
| **"Polkadot philosophy alignment"** | Medium | "Access to Tools", human agency |

### The 60-Second Test

Judges form an opinion in ~60 seconds. Your demo must:

1. **0–15 sec:** Show the sheet — "Wait, DeFi in a spreadsheet?"
2. **15–30 sec:** Connect wallet, show live portfolio
3. **30–45 sec:** AI chat → "swap 10 USDT for DOT" → staged trade
4. **45–60 sec:** Execute, show tx — "And it uses XCM precompile for cross-chain"

---

## Part 2: Track 1 (EVM) — Strengthening to Win

### Current Strengths ✅

- AI chat (Gemini)
- DeFi (portfolio, swaps, risk rules)
- Spreadsheet UX
- Polkadot Hub target

### Improvements to Add

#### 1. **OpenZeppelin Contract (EVM + Sponsor Track)**

Deploy a `SheetFraRegistry.sol` that:

- Uses **Ownable**, **ReentrancyGuard**, **Pausable** from OpenZeppelin
- Logs on-chain: sheetId → wallet → action type (swap/stake/approve)
- Provides **audit trail** — "Every sheet action is verifiable on-chain"
- Non-trivial: not just a token; real application logic

```solidity
// Concept: SheetFraRegistry.sol
contract SheetFraRegistry is Ownable, ReentrancyGuard, Pausable {
    event SheetActionRegistered(string sheetId, address wallet, bytes32 actionHash, uint8 actionType);
    function registerAction(string calldata sheetId, bytes32 actionHash, uint8 actionType) external whenNotPaused;
}
```

**Judge impact:** "They used OpenZeppelin properly for a real use case."

---

#### 2. **Stablecoin-First Narrative**

Make USDT/USDC the hero:

- **New sheet tab:** "Stablecoin Reserve" — min % in stables, alerts when below
- **AI commands:** "How much stablecoin reserve do I have?" "Rebalance to 40% USDT"
- **Risk Rules:** Emphasize `min_stable_reserve_usd`, `target_USDC`

**Judge impact:** Strong alignment with "Stablecoin-enabled dapps" category.

---

#### 3. **AI Enhancement — Polkadot-Aware**

Update Gemini system prompt:

- Add: "You are SheetFra, a DeFi assistant for Polkadot Hub. You help users manage DOT, USDT, WETH on Polkadot Hub."
- Add: "Polkadot Hub unifies DOT, staking, governance. Parachains connect via XCM."
- New commands: `/dot-price`, `/polkadot-status`, `/parachains`

**Judge impact:** AI feels native to Polkadot, not generic.

---

#### 4. **Polish the Demo Flow**

- **Pre-recorded backup:** If live demo fails, have 3-min video ready
- **Sheet template:** One-click "Make a copy" → user has working sheet
- **Loading states:** Show "Syncing with Polkadot Hub..." not blank cells

---

## Part 3: Track 2 (PVM) — Adding the Missing Layer

Track 2 wants: **Precompiles**, **Polkadot native Assets**, **PVM experiments**.

### Strategy: SheetFra XCM Bridge Contract

Create a contract that **uses the XCM precompile** so your sheet can:

1. **Query cross-chain asset positions** (via XCM `weighMessage` or asset pallet)
2. **Initiate asset transfers** from sheet → parachain (or vice versa)
3. **Log XCM operations** for the sheet's audit trail

### Implementation: `SheetFraXcmBridge.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

address constant XCM_PRECOMPILE = address(0xA0000);

interface IXcm {
    struct Weight { uint64 refTime; uint64 proofSize; }
    function weighMessage(bytes calldata message) external view returns (Weight memory);
    function execute(bytes calldata message, Weight calldata weight) external;
}

/// @title SheetFraXcmBridge
/// @notice Enables spreadsheet-driven XCM operations on Polkadot Hub
contract SheetFraXcmBridge {
    event XcmOperationRequested(address indexed from, bytes32 operationId, string sheetRef);
    
    function requestXcmWeigh(bytes calldata xcmMessage) external returns (uint64 refTime, uint64 proofSize) {
        IXcm.Weight memory w = IXcm(XCM_PRECOMPILE).weighMessage(xcmMessage);
        return (w.refTime, w.proofSize);
    }
    // ... execute with user approval flow
}
```

**What this gives you:**
- **Precompiles:** Direct use of XCM precompile at `0xA0000`
- **Polkadot native:** XCM is Polkadot's core interoperability primitive
- **Track 2 fit:** "Accessing Polkadot native functionality - build with precompiles"

### Alternative: Polkadot Native Assets in Sheet

Polkadot Hub has an **Assets pallet** with ERC20-style precompile. Your sheet could:

- Display **native DOT** (Asset ID 0 or similar) balance
- Display **foreign assets** (USDT, WETH as Asset Hub assets) via precompile addresses
- Show "Polkadot Native" vs "EVM ERC20" in the portfolio tab

**Implementation:** Use the [ERC20 precompile for Assets](https://docs.polkadot.com) — addresses like `0x0000...0001` for Asset ID 1. Query balances from your backend, display in sheet.

---

## Part 4: Dual-Track Submission Strategy

### Option A: Single Submission, Dual Relevance

Submit **once** to the hackathon. In your description:

- **Track 1 (EVM):** "SheetFra is an AI-powered DeFi dapp with stablecoin support, deployed on Polkadot Hub EVM."
- **Track 2 (PVM):** "SheetFra integrates XCM precompile for cross-chain asset visibility and uses Polkadot native Assets."

Judges may consider you for both tracks if the project clearly satisfies both.

### Option B: Two Submissions (if allowed)

- **Submission 1:** "SheetFra EVM" — DeFi + AI, EVM contracts
- **Submission 2:** "SheetFra PVM" — XCM precompile bridge, native assets

Check hackathon rules: some allow one project, one track; others allow multiple.

---

## Part 5: Prioritized Action List

### Must-Have (Before Submission)

| # | Task | Track | Effort | Impact |
|---|------|-------|--------|--------|
| 1 | Deploy `SheetFraRegistry.sol` with OpenZeppelin | EVM + OZ | 1 day | High |
| 2 | Pivot RPC + tokens to Polkadot Hub | EVM | 0.5 day | Critical |
| 3 | Add Polkadot context to Gemini prompts | EVM | 0.5 day | High |
| 4 | Create `SheetFraXcmBridge.sol` (weighMessage + execute) | PVM | 1–2 days | Critical for T2 |
| 5 | New sheet tab: "XCM / Cross-Chain" (even if mocked) | PVM | 0.5 day | High |
| 6 | Record 3–5 min demo video | Both | 0.5 day | Critical |
| 7 | README + setup guide + architecture diagram | Both | 0.5 day | Critical |

### Nice-to-Have

| # | Task | Track | Impact |
|---|------|-------|--------|
| 8 | Stablecoin Reserve tab + AI commands | EVM | Medium |
| 9 | Polkadot native asset balance in portfolio | PVM | Medium |
| 10 | One-click sheet template link | Both | Medium |
| 11 | `/dot-price`, `/polkadot-status` slash commands | EVM | Low |

### Polish

| # | Task |
|---|------|
| 12 | Polkadot on-chain identity for all team members |
| 13 | Pitch deck (5–10 slides) with philosophy alignment |
| 14 | "Why SheetFra wins" one-pager for judges |

---

## Part 6: Demo Script (Winning Version)

### Act 1: The Hook (30 sec)

> "Most DeFi lives in browsers. But treasurers live in spreadsheets. SheetFra puts Polkadot DeFi where they already work."

Show: Google Sheet open, clean UI.

### Act 2: The Magic (90 sec)

1. **Connect:** Paste WalletConnect URI → Talisman connects
2. **Portfolio:** "View Transactions" tab shows DOT, USDT, WETH — live from Polkadot Hub
3. **AI:** Type "swap 10 USDT for DOT" in Chat
4. **Staging:** Pending Swaps tab shows staged trade; user checks "Approve"
5. **Execute:** Tx confirmed; explorer link in sheet
6. **Registry:** "Every action is logged on-chain" — show SheetFraRegistry event

### Act 3: The Differentiator (60 sec)

7. **XCM tab:** "We use Polkadot's XCM precompile to enable cross-chain visibility"
8. **Contract:** Show `SheetFraXcmBridge` calling `weighMessage` — "Solidity talking to XCM"
9. **Future:** "Roadmap: XCM transfers from sheet, DOT staking, DAO workspaces"

### Closing (15 sec)

> "SheetFra: Your spreadsheet as a Polkadot DeFi control plane. Built for EVM. Powered by XCM. Ready for both tracks."

---

## Part 7: One-Pager for Judges

Use this in your submission description or as a PDF attachment:

```
SHEETFRA — Spreadsheet as Polkadot DeFi Control Plane

TRACK 1 (EVM): ✅ AI-powered dapp (Gemini chat) ✅ DeFi/Stablecoin (swaps, USDT, risk rules)
TRACK 2 (PVM): ✅ XCM precompile (SheetFraXcmBridge) ✅ Polkadot native Assets

UNIQUE: No other project puts DeFi in a spreadsheet on Polkadot.
PHILOSOPHY: "Access to Tools" — spreadsheets are where finance already lives.
TECH: Solidity + OpenZeppelin + XCM precompile + Gemini AI.

DEMO: [link]  |  REPO: [link]  |  VIDEO: [link]
```

---

## Part 8: Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Polkadot Hub testnet unstable | Have Sepolia fallback for demo; note "Polkadot Hub primary" |
| XCM precompile complex | Start with `weighMessage` only; full execute is bonus |
| Live demo fails | Pre-recorded video as backup |
| Judges miss PVM component | Explicit "Track 2" section in README and submission |

---

## Summary

To maximize chances of winning **both** tracks:

1. **Track 1:** Strengthen with OpenZeppelin contract, stablecoin narrative, Polkadot-aware AI.
2. **Track 2:** Add `SheetFraXcmBridge.sol` using XCM precompile + native assets in sheet.
3. **Demo:** 3-act script with clear "wow" moments.
4. **Docs:** Explicit dual-track fit in README and one-pager.

The winning combo: **Spreadsheet + AI + DeFi (EVM) + XCM (PVM)** — no competitor has this.
