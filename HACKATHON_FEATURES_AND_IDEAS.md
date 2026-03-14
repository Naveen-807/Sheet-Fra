# SheetFra — Hackathon Features & Ideas (Requirements Checklist)

**Source:** Polkadot Solidity Hackathon 2026 — [DoraHacks](https://dorahacks.io/hackathon/polkadot-solidity-hackathon) | [polkadothackathon.com](https://polkadothackathon.com)

---

## Part 1: Hackathon Requirements (What Judges Need)

### Bare Minimum (Disqualification if missed)

| # | Requirement | SheetFra Status |
|---|-------------|-----------------|
| 1 | Code contributed during hackathon only | ⚠️ Ensure commits during Mar 1–20 |
| 2 | Commit log reflects active contributions | ⚠️ Regular commits, clear history |
| 3 | Valid commit history during event | ⚠️ No last-day dump |
| 4 | All team members verify identity in Polkadot Discord | ⚠️ Do before Mar 20 |
| 5 | <70% similarity to existing repos | ✅ New repo, SheetFra branding |
| 6 | Open-source | ✅ MIT |

### Project Winner Criteria (Must Have to Win)

| # | Requirement | SheetFra Status |
|---|-------------|-----------------|
| 1 | **Polkadot on-chain identity** | ❌ Set up for team |
| 2 | **Quality documentation** (README / GitBook / Notion / PDF) | ✅ README; add GitBook recommended |
| 3 | **Good UI/UX** | ✅ Spreadsheet UX; polish sidebar/cells |
| 4 | **Demo video OR screenshots** | ❌ Record 3–5 min video |
| 5 | **Hosted deployment OR local install guide** | ⚠️ Backend deploy; add clear install steps |
| 6 | **Vision & commitment** (roadmap, future) | ✅ Roadmap in README |
| 7 | **Track relevance** | ⚠️ Must explicitly match track |

---

## Part 2: Track-Specific Requirements & Features

### Track 1: EVM Smart Contract ($15,000)

**Focus areas:** AI-powered dapps | DeFi & Stablecoin-enabled dapps

| Category | Required Fit | Features SheetFra Needs |
|----------|--------------|--------------------------|
| **AI-powered** | Core product uses AI meaningfully | ✅ Gemini chat for NL commands; stage swaps from conversation |
| **DeFi** | DeFi flows (swap, lend, stake, LP) | ✅ Portfolio, swaps, risk rules; add stablecoin emphasis |
| **Stablecoin** | USDT/USDC as primary asset | ✅ USDT support; add Stablecoin Reserve tab |
| **Polkadot Hub** | Deploy & run on Polkadot Hub | ✅ Target Polkadot Hub; verify deployment |
| **Solidity** | EVM-compatible smart contracts | ✅ SheetFraRegistry, integration with swaps |

**Concrete features for Track 1:**

| Feature | Status | Priority |
|---------|--------|----------|
| AI chat (Gemini) for natural-language DeFi | ✅ Done | — |
| Swap staging with approve-before-execute | ✅ Done | — |
| Portfolio view (DOT, USDT, WETH) | ✅ Done | — |
| Risk rules (slippage, cooldown, daily limit) | ✅ Done | — |
| SheetFraRegistry (OpenZeppelin) | ✅ Done | — |
| **Stablecoin Reserve tab** — min % in USDT, alerts | ❌ Add | High |
| **AI commands for stablecoin** — "How much in stables?" | ❌ Add | Medium |
| **Register actions on-chain** — call `registerAction()` after swaps | ❌ Integrate | High |
| **DOT staking view** (read-only) | ❌ Add | Nice |

---

### Track 2: PVM Smart Contracts ($15,000)

**Categories:** Precompiles | Polkadot native Assets | PVM experiments (Rust/C++ from Solidity)

| Category | Required Fit | Features SheetFra Needs |
|----------|--------------|--------------------------|
| **Precompiles** | Use Polkadot precompiles in Solidity | ✅ SheetFraXcmBridge uses XCM precompile |
| **Native Assets** | Use Polkadot native Assets pallet | ❌ Add: display native DOT via Asset pallet/precompile |
| **PVM experiments** | Call Rust/C++ from Solidity | ❌ Optional; complex |

**Concrete features for Track 2:**

| Feature | Status | Priority |
|---------|--------|----------|
| SheetFraXcmBridge (weighMessage, execute) | ✅ Done | — |
| **XCM / Cross-Chain tab** — show parachain assets or mock | ❌ Add | High |
| **Call XCM precompile from backend** — demo weighMessage | ❌ Integrate | High |
| **Native DOT balance** via Assets precompile (if available) | ❌ Add | Medium |
| **Document XCM flow** in README | ❌ Add | High |

---

### OpenZeppelin Sponsor Track ($1,000)

| Requirement | SheetFra Status |
|-------------|-----------------|
| Deploy to Polkadot Hub | ✅ |
| Non-trivial usage (beyond ERC20) | ✅ SheetFraRegistry has linkSheet, registerAction |
| Use OpenZeppelin as core | ✅ Ownable, ReentrancyGuard, Pausable |
| Documented contract architecture | ⚠️ Add contract docs to README |

**Add:** README section: "Contract Architecture — OpenZeppelin libraries used, customizations, deployment."

---

## Part 3: Ideas Aligned to Hackathon Themes

### From Hackathon Detail Page

> *"Your application on Polkadot Hub can: Build once, scale everywhere; Leverage XCM as a native feature; Bridge and interact with other EVM chains; Communicate seamlessly with existing parachains."*

| Theme | Idea | Effort | Impact |
|-------|------|--------|--------|
| **XCM** | XCM tab showing "assets on other parachains" (even mocked) | Low | High |
| **Scale everywhere** | Roadmap: "Future: Hydration, Bifrost, other parachains" | None | Medium |
| **Bridge** | Mention Snowbridge WETH in portfolio; link to bridge docs | Low | Low |
| **Parachains** | Slash command `/parachains` — list Polkadot parachains | Low | Medium |

### From Strategic Partners (Polkadothackathon.com)

- **Bifrost** — Liquid staking (vDOT). Idea: Show vDOT in portfolio or roadmap.
- **Hyperbridge** — Cross-chain. Idea: "Future: Hyperbridge for multi-chain portfolio."
- **Papermoon, Bolt** — Ecosystem. Mention in roadmap.

**Low-effort ideas:** Add `/bifrost` or vDOT to AI context; add "Bifrost vDOT" to roadmap.

---

## Part 4: Feature Checklist (Prioritized)

### Must Ship (Before Submission)

| # | Feature | Track | Effort |
|---|---------|-------|--------|
| 1 | Deploy backend (Railway/Vercel/Render) | Both | 1 hr |
| 2 | Record 3–5 min demo video | Both | 2 hr |
| 3 | Polkadot on-chain identity (all team) | Both | 1 hr |
| 4 | Call `registerAction()` after each swap | EVM + OZ | 2 hr |
| 5 | XCM tab (or section) — e.g. "Cross-Chain (XCM)" with weighMessage demo | PVM | 2–4 hr |
| 6 | README: Problem → Solution → Architecture → Demo links | Both | 1 hr |
| 7 | Deploy contracts to Polkadot Hub Testnet | Both | 1 hr |
| 8 | Explicit track fit in submission | Both | 30 min |

### Should Ship (Strong impact)

| # | Feature | Track | Effort |
|---|---------|-------|--------|
| 9 | Stablecoin Reserve tab — min % USDT, alert if below | EVM | 2 hr |
| 10 | GitBook or Notion (architecture + setup) | Both | 2 hr |
| 11 | Pitch deck (5–10 slides) | Both | 2 hr |
| 12 | Code breakdown in README (folder map) | Both | 30 min |
| 13 | Comparison table: SheetFra vs traditional dApp | Both | 30 min |
| 14 | Contract architecture doc (OpenZeppelin) | OZ | 1 hr |

### Nice to Have

| # | Feature | Track |
|---|---------|-------|
| 15 | `/parachains` — list Polkadot parachains | EVM |
| 16 | vDOT / Bifrost in AI context & roadmap | EVM |
| 17 | One-click "Copy Sheet" template link | Both |
| 18 | TL;DR 60-sec video at top of README | Both |

---

## Part 5: New Sheet Tab Ideas (Hackathon-Focused)

| Tab Name | Purpose | Track | Status |
|----------|---------|-------|--------|
| **Stablecoin Reserve** | Min % in USDT, current %, alert when below threshold | EVM | ❌ Add |
| **XCM / Cross-Chain** | Parachain assets, XCM weighMessage result, or "Coming soon" | PVM | ❌ Add |
| **Contract Activity** | Last 10 `SheetActionRegistered` events from SheetFraRegistry | EVM | ❌ Add |
| **Polkadot Hub Status** | Chain ID, block height, RPC status | Both | ❌ Add (or use /hub-status) |

---

## Part 6: AI Feature Ideas (Track 1: AI-powered)

| Command / Intent | Response | Status |
|------------------|----------|--------|
| "swap 10 USDT for DOT" | Stage trade | ✅ |
| "How much stablecoin do I have?" | Sum USDT, show % of portfolio | ❌ Add |
| "What's my DOT price?" | Fetch/show DOT-USD | ❌ (partial: /dot-price) |
| "Rebalance to 40% USDT" | Suggest swap legs, stage | ❌ Add |
| "Show risk rules" | /risk equivalent | ✅ |
| "What parachains does Polkadot have?" | /parachains | ❌ Add |
| "Stake my DOT" | "Staking from sheet coming in Q3" + link | ❌ Add |

---

## Part 7: Submission Checklist (Final)

### Before Mar 20

- [ ] All code committed during hackathon window
- [ ] Polkadot on-chain identity set (all members)
- [ ] Identity verified in Polkadot Discord
- [ ] Contracts deployed to Polkadot Hub Testnet
- [ ] Backend hosted and reachable
- [ ] Demo video uploaded (YouTube)
- [ ] README: Problem, Solution, Architecture, Demo links, Track fit
- [ ] GitBook or expanded docs (recommended)
- [ ] Pitch deck (recommended)
- [ ] SheetFraRegistry: `registerAction()` called on swaps
- [ ] XCM: SheetFraXcmBridge demonstrated (tab or doc)
- [ ] Stablecoin emphasis visible (tab or AI)

### Submission Text Template

```
TRACK 1 (EVM): AI-powered + DeFi/Stablecoin
- AI: Gemini chat for natural-language swaps and portfolio queries
- DeFi: Swaps, portfolio, risk rules, approve-before-execute
- Stablecoin: USDT primary, Stablecoin Reserve tab, min % alerts

TRACK 2 (PVM): Precompiles
- SheetFraXcmBridge uses XCM precompile (weighMessage, execute)
- Cross-chain visibility from spreadsheet

OPENZEPPELIN: SheetFraRegistry uses Ownable, ReentrancyGuard, Pausable

LIVE DEMO: [url]
VIDEO: [url]
REPO: [url]
```

---

## Part 8: Quick Reference — What You Have vs Need

| Area | Have | Need |
|------|------|------|
| **AI** | Gemini chat, swap staging, /risk, /polkadot, /hub-status | Stablecoin queries, /parachains |
| **DeFi** | Portfolio, swaps, risk rules, pending trades | Stablecoin Reserve tab, registerAction integration |
| **Contracts** | SheetFraRegistry, SheetFraXcmBridge | Deploy, document, integrate registerAction |
| **Track 2** | SheetFraXcmBridge contract | XCM tab, backend call to weighMessage, doc |
| **Docs** | README | GitBook, code breakdown, comparison table |
| **Demo** | Architecture | Hosted URL, video, deck |
| **Compliance** | Open source | On-chain identity, Discord verify |

---

## Summary

**Top 5 priorities:**

1. **Deploy + video** — Host backend, record 3–5 min demo.
2. **registerAction** — Call it after every swap for on-chain audit.
3. **XCM tab** — Show XCM precompile use (weighMessage or execute).
4. **Stablecoin Reserve tab** — Emphasize stablecoin category.
5. **Docs + track fit** — README structure, GitBook, explicit track alignment.

**One sentence:** Ship the core flow, add XCM and stablecoin features, document clearly, and make track fit obvious to judges.
