# Polkadot Hackathon Winners — Reverse Engineering & What to Do to Win

**Goal:** Reverse engineer previous winners (websites, repos, demos, docs) and extract actionable tactics for SheetFra.

---

## Part 1: Winner Deep Dive

### 1. Keyring (2024 Bangkok 1st — Developer Tools)

**Website:** [keyring.so](https://keyring.so)

| Element | What They Did | Why It Won |
|---------|---------------|------------|
| **Product** | Hardware wallet as financial card; NFC, EAL5+ security | Familiar UX (card) for unfamiliar tech (blockchain) |
| **Polkadot fit** | XCM v4 Go SDK, teleport assets, nominate pools, EVM pallet | Deep Polkadot-native integration |
| **Demo** | YouTube video, Google Slides, live site | Professional, multiple touchpoints |
| **Docs** | README with features, architecture, team, bounty (Moonbeam) | Clear structure, sponsor alignment |
| **Tech** | Javacard, Golang Wails, React/React Native | Hardware + software depth |
| **Team** | 10yr dev, 5yr blockchain; 8yr hardware, 2yr blockchain | Credibility |

**Tactics to copy:**
- Lead with **familiar metaphor** (card = financial tool)
- **Multiple Polkadot primitives** (XCM, staking, EVM)
- **Working website** + demo video + slides
- **Sponsor alignment** (Moonbeam bounty)

---

### 2. DAppForge (2024 Bangkok 2nd — Developer Tools)

**Website:** dappforge.app (404 now; was live)

| Element | What They Did | Why It Won |
|---------|---------------|------------|
| **Product** | AI VS Code plugin for Substrate/ink! | Solves DevEx (#1 Polkadot pain) |
| **Differentiation** | Fine-tuned for Polkadot, not generic Copilot | Ecosystem-specific AI |
| **Funding** | $100K angel, $105K treasury | Proof of traction |
| **Demo** | Loom video, Google Slides | Async-friendly |
| **Architecture** | AWS (API GW, Lambda, DynamoDB), TS + React | Clear stack |
| **Team** | BD, full-stack, designer, AI engineer | Balanced skills |

**Tactics to copy:**
- Address **top ecosystem problem** (DevEx)
- **AI tailored to Polkadot**, not generic
- **Traction** (funding, users) if possible
- **Simple demo** (Loom)

---

### 3. Relay (2024 Bangkok 1st — DeFi/Smart Contracts)

**Live Demo:** [relay-console.vercel.app](https://relay-console.vercel.app)

| Element | What They Did | Why It Won |
|---------|---------------|------------|
| **Product** | IoT + Polkadot: RFID payment for stores | Real-world use (payments) |
| **Problem** | “Small business owners can’t adopt crypto easily” | Clear problem statement |
| **Components** | Dotlink SDK (RPi), Relayconsole (React), Relay-api | 3-part architecture |
| **Docs** | GitBook (architecture, API manual) | Professional docs |
| **Flow** | Register → NFC card → tap to pay → on-chain | End-to-end story |
| **Bounty** | Blockchain for Good | Sponsor fit |
| **Team** | IoT, frontend, backend/blockchain | Coverage of stack |

**Tactics to copy:**
- **Concrete problem** (store owners, not “DeFi users”)
- **End-to-end flow** (register → use → verify)
- **GitBook** for docs
- **Hosted demo** (Vercel)

---

### 4. No Sandwich Swap (2024 Bangkok 3rd — DeFi)

| Element | What They Did | Why It Won |
|---------|---------------|------------|
| **Product** | Anti-MEV DEX with Hyperbolic Call Auction | Strong DeFi angle |
| **Differentiation** | Math proof (O(√n) volatility bound) | Technical depth |
| **Docs** | Formal math in README | Credibility |
| **Tokenomics** | SANDWICH governance, decay model | Full product thinking |
| **Demo** | YouTube, Google Slides | Standard assets |
| **Deploy** | Moonbeam fork (anvil) | Real chain |
| **Team** | PM, quant, contract dev, full-stack, architect, designer | Full team |

**Tactics to copy:**
- **Clear DeFi innovation** (anti-MEV, new mechanism)
- **Math/formalization** where it fits
- **Deployed on-chain** (testnet or fork)
- **Full team** with distinct roles

---

### 5. zkLogin (2024 Bangkok 1st — Open Theme)

| Element | What They Did | Why It Won |
|---------|---------------|------------|
| **Product** | Web2 login (e.g. Google) → Polkadot via ZK | Mass onboarding |
| **Problem** | “Polkadot lags in AA” | Ecosystem gap |
| **Tech** | Runtime pallet, ZK circuits, Chrome extension | Full-stack |
| **Comparison** | Table: zkLogin vs EOAs | Clear positioning |
| **Docs** | CN + EN, deck PDF | Accessibility |
| **Bounty** | Bifrost | Sponsor alignment |
| **Team** | ZK researcher, UI/wallet dev | Specialized skills |

**Tactics to copy:**
- **Fill ecosystem gap** (AA/onboarding)
- **Comparison table** (your solution vs status quo)
- **Full-stack** (pallet + wallet + circuits)
- **Bilingual docs** if relevant

---

### 6. HyperAgile (2024 Bangkok 3rd Open, CESS 1st, Best University)

**Live Demo:** [hyper-agile.vercel.app](https://hyper-agile.vercel.app)

| Element | What They Did | Why It Won |
|---------|---------------|------------|
| **Product** | RPA ↔ Polkadot middleware (MaaS) | Enterprise + Polkadot |
| **Problem** | “Industries can’t connect RPA to Polkadot” | B2B problem |
| **Precompiles** | Moonbeam Randomness, Batch, Call Permit | Uses sponsor tech |
| **Sponsor** | CESS DeOSS for lifecycle reports | Deep CESS integration |
| **Demo** | Physical robot + Webots sim | Very memorable |
| **Docs** | Code breakdown by folder | Judge-friendly |
| **TL;DR** | 6-min video link at top of README | Low-friction entry |

**Tactics to copy:**
- **Use sponsor precompiles** explicitly
- **Integrate sponsor products** (e.g. CESS)
- **Physical demo** if possible
- **Code submission breakdown** for judges
- **TL;DR video** at top of README

---

### 7. Cyferio Hub (2024 Bangkok 1st — Blockchain SDKs, Best Innovation)

**Website:** [cyferio.com](https://cyferio.com)

| Element | What They Did | Why It Won |
|---------|---------------|------------|
| **Product** | Decentralized caching + FHE co-processor | Infrastructure layer |
| **Tech** | TMC (FHE), Float Cache DB, JMT, Walrus | Deep technical stack |
| **Scope** | “Enhance experience for billions of users” | Ambitious vision |
| **Delivery** | 7 days from signup to MVP | Execution speed |
| **Team** | ZK/FHE, TMC, blockchain | Technical depth |
| **Assets** | Ecosystem + architecture diagrams | Visual clarity |

**Tactics to copy:**
- **Infrastructure angle** if it fits
- **Diagrams** (ecosystem, architecture)
- **Execution** (shipped in tight timeline)

---

### 8. Kernel (2025 AssetHub — Notable)

**Live Demo:** [kernel-two.vercel.app](https://kernel-two.vercel.app)

| Element | What They Did | Why It Won |
|---------|---------------|------------|
| **Product** | AI IDE for Polkadot AssetHub | AI + developer tools |
| **Features** | 9+ (templates, auditor, tests, NL interaction, etc.) | Feature density |
| **Stack** | Next.js, GraphQL, Gemini, Resolc, Wagmi, Privy | Modern stack |
| **Polkadot** | AssetHub, Resolc, deploy | Deep integration |
| **Docs** | Table of Contents, Getting Started | Easy to navigate |

**Tactics to copy:**
- **Feature breadth** (many working features)
- **Polkadot-specific tooling** (AssetHub, Resolc)
- **Hosted demo** (Vercel)

---

### 9. PolkaLend (2025 AssetHub — Notable)

| Element | What They Did | Why It Won |
|---------|---------------|------------|
| **Product** | Lending: volatile collateral → stablecoin borrow | DeFi + stablecoin |
| **Differentiation** | Dynamic pricing, real-time oracle | Solves oracle/volatility risk |
| **Pitch** | “Forgot volatile market price changes” | Clear problem |
| **Links** | Demo video, GitHub | Standard assets |

**Tactics to copy:**
- **Single, clear DeFi use case**
- **Differentiator** (dynamic pricing vs static)
- **Stablecoin** as core asset

---

## Part 2: Winning Pattern Synthesis

| Pattern | Examples | How to Apply to SheetFra |
|---------|----------|---------------------------|
| **Familiar UX for unfamiliar tech** | Keyring (card), Relay (tap to pay) | Spreadsheet = familiar for DeFi |
| **Solve #1 ecosystem pain** | DAppForge (DevEx), zkLogin (onboarding) | Treasurers live in spreadsheets |
| **Polkadot-native primitives** | Keyring (XCM), HyperAgile (precompiles) | XCM precompile, native assets |
| **Sponsor integration** | HyperAgile (CESS, Moonbeam), Keyring (Moonbeam) | OpenZeppelin, Polkadot Hub |
| **Live demo URL** | Relay, HyperAgile, Kernel | Host SheetFra demo |
| **GitBook / pro docs** | Relay | GitBook or Notion |
| **Problem → solution** | All | “Treasurers use spreadsheets, dApps don’t” |
| **Code breakdown for judges** | HyperAgile | README with folder map |
| **Comparison table** | zkLogin | SheetFra vs traditional dApp UX |
| **Physical / memorable demo** | HyperAgile (robot) | Spreadsheet on big screen |
| **TL;DR video** | HyperAgile | 60–90 sec summary at top |
| **Multiple deliverables** | All | Video + slides + repo + live demo |
| **Team credibility** | Keyring, DAppForge | Clear roles and experience |

---

## Part 3: Concrete Checklist for SheetFra

### Must Do (Before Submission)

| # | Action | Winner precedent |
|---|--------|-------------------|
| 1 | **Host live demo** (Vercel/Railway) | Relay, HyperAgile, Kernel |
| 2 | **3–5 min demo video** (YouTube) | All winners |
| 3 | **Pitch deck** (Google Slides / PDF) | Keyring, DAppForge, zkLogin |
| 4 | **README structure** like winners: Problem → Solution → Architecture → Demo links → Team | All |
| 5 | **Code submission breakdown** in README (folder-by-folder) | HyperAgile |
| 6 | **Comparison table**: SheetFra vs traditional dApp | zkLogin |
| 7 | **GitBook or Notion** (architecture + setup) | Relay |
| 8 | **Sponsor tech** (OpenZeppelin, Polkadot Hub, XCM) explicitly called out | HyperAgile, Keyring |
| 9 | **Problem statement** in first paragraph | Relay, PolkaLend |

### Strongly Recommended

| # | Action |
|---|--------|
| 10 | **TL;DR video** (60–90 sec) link at top of README |
| 11 | **Simple website** (1 page: problem, solution, demo, links) |
| 12 | **Team section** with roles and background |
| 13 | **Bounty/track** explicitly stated (EVM, PVM, OpenZeppelin) |
| 14 | **Architecture diagram** (PNG in repo) |

### Polish

| # | Action |
|---|--------|
| 15 | **One-pager PDF** for judges |
| 16 | **“Why SheetFra wins”** section in README |
| 17 | **Screenshots** of sheet UI in README |

---

## Part 4: README Template (Winner-Style)

Use this structure:

```markdown
# SheetFra

> 👉 **TL;DR:** [60-sec video link] | [Live Demo](url) | [Full Demo](url)

## Problem

Treasurers and DAOs live in spreadsheets. DeFi lives in browsers. [Expand 2–3 sentences.]

## Solution

SheetFra makes a Google Sheet your Polkadot DeFi control plane. [Expand 2–3 sentences.]

## SheetFra vs Traditional dApp

| | SheetFra | Traditional dApp |
|---|---|---|
| UX | Spreadsheet | Browser extension / web app |
| Learning curve | None | High |
| Approval flow | Cell-based | Transaction popup |
| Audit | Sheet + on-chain | On-chain only |

## Features

- [ ] Live portfolio (DOT, USDT, WETH) from Polkadot Hub
- [ ] AI chat for natural-language swaps
- [ ] Staged trades with approval
- [ ] SheetFraRegistry (on-chain audit)
- [ ] SheetFraXcmBridge (XCM precompile)

## Architecture

[Diagram]

- Google Sheets → Agent → Polkadot Hub EVM
- Contracts: SheetFraRegistry, SheetFraXcmBridge

## Track & Sponsor Fit

- **Track 1 (EVM):** AI + DeFi/Stablecoin
- **Track 2 (PVM):** XCM precompile
- **OpenZeppelin:** Ownable, ReentrancyGuard, Pausable

## Demo Materials

1. [Demo Video](url)
2. [Live Demo](url)
3. [Presentation](url)
4. [GitBook Docs](url)

## Code Structure

- `sheets-agent/` — Node backend, Gemini, sheet watcher
- `contracts/` — SheetFraRegistry, SheetFraXcmBridge
- `google-apps-script/` — Sheet UI

## Team

| Name | Role |
|------|------|
| ... | ... |

## Quick Start

[3–5 commands]
```

---

## Part 5: What Judges See First

From winner READMEs, judges typically see (in order):

1. **Project name + tagline**
2. **TL;DR / quick links** (video, demo)
3. **Problem** (1–2 sentences)
4. **Solution** (1–2 sentences)
5. **Demo materials** (video, live, slides)
6. **Architecture**
7. **Track/bounty fit**
8. **Team**

**Optimize the first screen** so judges get the full story without scrolling.

---

## Part 6: Final Recommendation Summary

**To maximize winning chance, SheetFra should:**

1. **Ship** — Deploy backend, host demo, record video.
2. **Document** — README + GitBook + code breakdown.
3. **Differentiate** — Comparison table (SheetFra vs dApp).
4. **Align** — Explicit Track 1, Track 2, OpenZeppelin fit.
5. **Polish** — Deck, live demo, TL;DR video.
6. **Prove** — Working swap on Polkadot Hub + XCM precompile.
7. **Position** — “Treasurers live in spreadsheets; SheetFra brings Polkadot DeFi there.”

**Avoid:**
- Generic “DeFi dashboard” framing
- No live demo
- README without problem statement
- Missing sponsor/track alignment
- Overly long README with no TL;DR

---

## References

- [Keyring](https://keyring.so) | [Repo](https://github.com/OneBlockPlus/polkadot-hackathon-2024/tree/main/bangkok/33-Keyring)
- [DAppForge](https://github.com/OneBlockPlus/polkadot-hackathon-2024/tree/main/bangkok/08-dAppForge)
- [Relay](https://relay-console.vercel.app) | [Repo](https://github.com/OneBlockPlus/polkadot-hackathon-2024/tree/main/bangkok/19-Relay)
- [No Sandwich Swap](https://github.com/OneBlockPlus/polkadot-hackathon-2024/tree/main/bangkok/57-NoSandwichSwap)
- [zkLogin](https://github.com/OneBlockPlus/polkadot-hackathon-2024/tree/main/bangkok/03-zkLogin)
- [HyperAgile](https://hyper-agile.vercel.app) | [Repo](https://github.com/OneBlockPlus/polkadot-hackathon-2024/tree/main/bangkok/49-HyperAgile)
- [Cyferio](https://cyferio.com) | [Repo](https://github.com/OneBlockPlus/polkadot-hackathon-2024/tree/main/bangkok/44-Cyferio)
- [Kernel](https://kernel-two.vercel.app) | [DoraHacks](https://dorahacks.io/buidl/26796)
- [PolkaLend](https://dorahacks.io/buidl/26794)
