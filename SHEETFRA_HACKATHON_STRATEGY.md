# SheetFra — Polkadot Solidity Hackathon 2026
## Complete Context, Winner Analysis & Winning Strategy

---

## Part 1: Polkadot Philosophy & Ecosystem Context

### Philosophy (from [polkadot.com/philosophy](https://polkadot.com/philosophy))

Polkadot's core philosophy is **"Sovereign technology for sovereign people."**

| Theme | Polkadot Principle | Relevance to SheetFra |
|-------|--------------------|------------------------|
| **Human-centric tech** | "Technology as a tool for liberation, not control" | Spreadsheets are the ultimate user-owned tool — familiar, accessible, no dApp walled garden |
| **Access to Tools** | Whole Earth Catalog ethos: "power of the individual to conduct his own education, shape his own environment" | SheetFra = access to DeFi via spreadsheets — tools people already use |
| **Privacy & control** | "Privacy is the power to selectively reveal oneself" (Cypherpunk) | User controls what goes in the sheet; approval flow before execution |
| **Proof over trust** | Cryptographic proof instead of trusted third parties | On-chain execution, transparent audit in sheet |
| **Secure Social OS** | Gavin Wood's Web3: infrastructure for autonomous digital society | SheetFra as infrastructure for treasury ops, DAOs, teams |
| **Reclaimed agency** | "Technology must be reclaimed as an instrument of human agency" | Spreadsheet UX = user in control, not algorithm dictating UX |

**Key quote for your pitch:**  
> *"Polkadot offers a radical alternative. We believe technology must be reclaimed as an instrument of human agency, enabling individuals to shape their own paths to freedom."*  
— SheetFra puts DeFi control in **your spreadsheet**, not in a black-box dApp.

---

### Ecosystem (from [polkadot.com/ecosystem](https://polkadot.com/ecosystem))

| Category | Key Projects | SheetFra Integration |
|----------|--------------|----------------------|
| **Wallets** | Nova, Talisman, SubWallet | Use Talisman/SubWallet for WalletConnect on Polkadot Hub |
| **Bridges** | Snowbridge (Polkadot↔Ethereum), Hyperbridge (Polkadot↔EVM) | Future: show bridged assets from other chains in sheet |
| **DeFi** | Hydration (Omnipool), Bifrost (liquid staking vDOT) | Integrate Polkadot Hub DEX; show DOT, USDT, WETH |
| **Tools** | Subscan (explorer), Subsquare (governance) | Link tx hashes to Subscan; optional governance view |
| **Polkadot Hub** | Unified chain, EVM-compatible, DOT/staking/governance | Primary deployment target for SheetFra |

**Ecosystem map:** [justventuresgmbh.github.io/ecosystem-map](https://justventuresgmbh.github.io/ecosystem-map) — 250+ projects across DeFi, wallets, infrastructure, DAOs.

---

## Part 2: Previous Polkadot Hackathon Winners — Deep Analysis

### 2024 Polkadot Hackathon (Bangkok) — [Source](https://medium.com/@OneBlockplus/the-winners-of-the-2024-polkadot-hackathon-bangkok-edition-have-been-announced-92781cb8e27c)

**Judging criteria:** User Experience (10%), Innovation (20%), Commercial Value (20%), + Future Roadmap, Team, Demo.

#### Main Track Winners

| Category | 1st | 2nd | 3rd | Winning Pattern |
|----------|-----|-----|-----|-----------------|
| **Developer Tools** | **Keyring** — Card-like UX for blockchain | **DAppForge** — AI plugin for Substrate/ink! | **Murmur** — Keyless encryption wallet | Accessibility, AI, Account Abstraction |
| **DeFi / Smart Contracts** | **Relay** — IoT + crypto payments for stores | **Figo** — Physical + digital collectibles | **No Sandwich Swap** — Anti-MEV DEX | Real-world use, phygital, DeFi innovation |
| **Blockchain SDKs** | **Cyferio Hub** — Decentralized caching layer | **Cyborg Network** — DePIN edge computing | **SoftLaw** — IP licensing chain | Infrastructure, DePIN, specialized chains |
| **Open Theme** | **zkLogin** — Privacy-preserving Web2 login | **DOTCIRCLES** — Decentralized savings circles (Rosca) | **HyperAgile** — RPA↔Polkadot middleware | Onboarding, real-world finance, enterprise bridge |

#### Sponsor Picks

- **Bifrost:** zkLogin (privacy)
- **CESS:** HyperAgile, Cyborg (middleware, DePIN)
- **Moonbeam:** Bookadot (ticketing)

---

### 2025 Polkadot AssetHub Hackathon — [Source](https://dorahacks.io/hackathon/polkadot/report)

**Focus:** PolkaVM, Solidity on AssetHub, EVM↔Polkadot bridge.

#### Notable Winners & Finalists

| Project | What it does | Why it won |
|---------|--------------|------------|
| **Kernel** | AI-powered IDE for smart contracts | AI + developer tooling; Polkadot-specific |
| **PolkaLend** | Lending protocol, stablecoin borrowing vs volatile collateral | DeFi + stablecoins; clear use case |
| **StarkBridge** | Rust + Solidity cross-technology ZK verification | Interoperability; technical depth |
| **Vulpix** | Turn-based NFT battle game | Engaging demo; NFT ownership |
| **Polkadatchi** | Virtual pet game with NFTs | Gamification; accessible |
| **Oblivio** | Privacy tokens via Poseidon hashing | Privacy; Polkadot-native |
| **Polkaflow** | No-code AI workflow builder for smart contracts | AI + low-code; accessibility |
| **inzo** | AI-powered decentralized insurance | AI + DeFi; real-world use |
| **PolkaNews** | Decentralized news + AI credibility | AI + social/info |
| **MetaTrace** | AI metadata security + NFT provenance | AI + security |

---

### Winning Pattern Synthesis

| Pattern | Examples | SheetFra Alignment |
|---------|----------|--------------------|
| **AI + core product** | Kernel, DAppForge, Polkaflow, inzo | ✅ Gemini chat for natural-language DeFi |
| **Accessibility / low barrier** | Keyring, zkLogin, DOTCIRCLES, Polkaflow | ✅ Spreadsheet = zero-learning-curve UX |
| **DeFi with twist** | PolkaLend, No Sandwich Swap, Oblivio | ✅ DeFi via sheets (novel UX) |
| **Real-world / underserved** | Relay (IoT stores), DOTCIRCLES (savings), HyperAgile (RPA) | ✅ Treasuries, DAOs, teams already use spreadsheets |
| **Privacy / control** | zkLogin, Oblivio, Murmur | ✅ User approval flow; optional future privacy |
| **Interoperability** | StarkBridge, Hyperbridge | 🔄 Future: XCM view for parachain assets |
| **Developer tooling** | Kernel, DAppForge, PolkaGuard | 🔄 SheetFra as treasury/ops tool for builders |

---

## Part 3: Polkadot Solidity Hackathon 2026 — Requirements

### Tracks

| Track | Focus | Prize Pool |
|-------|-------|------------|
| **Track 1: EVM Smart Contract** | DeFi & Stablecoin dapps, **AI-powered dapps** | $15,000 |
| **Track 2: PVM Smart Contract** | PVM experiments, Polkadot native Assets, Precompiles | $15,000 |
| **OpenZeppelin Sponsor** | Secure Solidity on Polkadot Hub, non-trivial OpenZeppelin usage | $1,000 |

### Bare Minimum

- Code committed during hackathon
- Valid commit history
- Team identity verification via Polkadot Discord
- <70% similarity to existing repos
- Open-source

### Project Winner Requirements

- Polkadot on-chain identity
- Quality docs (README, GitBook, Notion, or site)
- Good UI/UX
- Demo video + hosted deployment OR local install guide
- Clear roadmap + future commitment
- Track relevance

---

## Part 4: SheetFra — Aligned Winning Strategy

### One-Line Pitch

> **SheetFra: Your spreadsheet as a Polkadot DeFi control plane — AI-powered portfolio, swaps, and treasury ops on Polkadot Hub.**

### Philosophy Alignment (for judges & pitch)

1. **"Access to Tools"** — Spreadsheets are the most universal tool. SheetFra brings Polkadot DeFi to users where they already work.
2. **Human agency** — User approves every trade; AI assists, doesn’t auto-execute.
3. **Real-world adoption** — DAOs, teams, and treasuries already use spreadsheets. SheetFra fits their workflow.
4. **Polkadot-native** — Polkadot Hub as primary chain; roadmap for XCM/parachain views.

### Track Fit

| Criterion | How SheetFra delivers |
|-----------|------------------------|
| **DeFi & Stablecoin** | Portfolio, swaps, USDT/DOT support, risk rules, rebalancing |
| **AI-powered** | Gemini chat for natural-language commands; staged swaps |
| **EVM on Polkadot Hub** | Deploy & integrate with Polkadot Hub EVM |
| **OpenZeppelin** (bonus) | Use Ownable, ReentrancyGuard in optional registry contract |

### Differentiators vs Previous Winners

| Previous winner | Their angle | SheetFra angle |
|-----------------|-------------|----------------|
| Keyring | Card-like UX | Spreadsheet UX (even more universal) |
| Polkaflow | No-code AI workflows | Spreadsheet-native AI DeFi |
| PolkaLend | Lending/stablecoin | Treasury ops + swaps in sheets |
| Kernel | AI IDE | AI-powered treasury ops (complementary) |
| DOTCIRCLES | Savings circles | Spreadsheet-based finance for groups |

**Unique combo:** Spreadsheet + AI + DeFi + Polkadot Hub — no prior winner has this mix.

---

## Part 5: Implementation Integration Checklist

### Technical Pivot (from FrankySheets)

- [ ] RPC: Sepolia → Polkadot Hub Testnet
- [ ] Chain ID: 420420417
- [ ] Tokens: DOT, USDT (or equivalent), WETH
- [ ] Block explorer: Subscan (Polkadot Hub)
- [ ] Wallets: Talisman, SubWallet for WalletConnect
- [ ] Branding: FrankySheets → SheetFra
- [ ] Gemini context: Add Polkadot/DOT/parachain awareness

### Smart Contract (Optional but Strong)

- [ ] `SheetFraRegistry.sol` — On-chain audit log of sheet→wallet links
- [ ] OpenZeppelin: Ownable, ReentrancyGuard, Pausable
- [ ] Deploy to Polkadot Hub Testnet via Hardhat/Foundry

### AI Enhancement

- [ ] System prompt: Polkadot ecosystem context (DOT, parachains, Polkadot Hub)
- [ ] Commands: `/polkadot`, `/hub-status`, `/dot-price`
- [ ] Trade staging: Keep approve-before-execute flow

### Demo Flow (3–5 min)

1. Open SheetFra sheet
2. Connect Talisman/SubWallet via WalletConnect
3. Show portfolio (DOT, USDT, WETH)
4. Chat: "swap 10 USDT for DOT"
5. Show staged trade in Pending Swaps
6. Approve and execute
7. Show tx on Subscan
8. Show updated portfolio

### Documentation

- [ ] README with local setup + env vars
- [ ] Video walkthrough
- [ ] Architecture diagram
- [ ] Roadmap (Q2: XCM, Q3: staking, Q4: DAO workspaces)

### Compliance

- [ ] Polkadot on-chain identity for team
- [ ] Identity verification in Polkadot Discord
- [ ] New repo (or clear fork) with hackathon commits
- [ ] MIT license

---

## Part 6: Pitch Narrative (for judges)

**Problem:** DeFi is powerful but hard to use. Treasuries and teams live in spreadsheets; dApps live in browsers.

**Solution:** SheetFra makes a Google Sheet your DeFi control plane on Polkadot Hub. View portfolio, chat with AI, stage swaps, approve, and execute — all from a spreadsheet.

**Why Polkadot:** Polkadot Hub unifies DOT, staking, governance, and EVM. SheetFra is built for this ecosystem from day one.

**Why it wins:** Combines AI (Kernel, Polkaflow pattern), DeFi (PolkaLend pattern), and accessibility (Keyring, DOTCIRCLES pattern) with a unique spreadsheet UX that matches Polkadot’s “Access to Tools” philosophy.

**Future:** XCM for parachain assets, DOT staking from the sheet, DAO workspaces. SheetFra as the treasury OS for Polkadot.

---

## References

- [Polkadot Philosophy](https://polkadot.com/philosophy)
- [Polkadot Ecosystem](https://polkadot.com/ecosystem)
- [Polkadot Solidity Hackathon 2026](https://polkadothackathon.com/)
- [DoraHacks Rules](https://dorahacks.io/hackathon/polkadot-solidity-hackathon/rules)
- [2024 Bangkok Winners (Medium)](https://medium.com/@OneBlockplus/the-winners-of-the-2024-polkadot-hackathon-bangkok-edition-have-been-announced-92781cb8e27c)
- [2025 AssetHub Report (DoraHacks)](https://dorahacks.io/hackathon/polkadot/report)
- [Polkadot Ecosystem Map](https://justventuresgmbh.github.io/ecosystem-map/)
- [Polkadot Developer Docs — EVM](https://docs.polkadot.com/develop/smart-contracts/libraries/ethers-js)
- [OpenGuild Hackathon Resources](https://build.openguild.wtf/hackathon-resources)
