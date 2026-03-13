export interface PortfolioUpdate {
  action: "UPDATE_PORTFOLIO"
  totalValueUsd: string
  prices: Record<string, string>
  balances?: Record<string, string>
  timestamp: number
  source: string
  snapshotId?: string
  walletHash?: string
  onchainReport?: {
    receiver: string
    status: string
    txHash?: string
  }
}

export interface RebalancePlanResult {
  action: "REBALANCE_PLAN"
  requestId?: string
  rebalancePlanId: string
  walletHash?: string
  command?: string
  decisionMode?: string
  selectedCandidateId?: string
  status: string
  confidence: string
  summary: string
  rationale: string[]
  warnings?: string[]
  currentAllocations: Record<string, number>
  targetAllocations: Record<string, number>
  predictedAllocations: Record<string, number>
  policyChecks: PolicyCheckResult[]
  candidates?: RebalanceCandidateResult[]
  healthBefore?: PortfolioHealthScore
  healthAfter?: PortfolioHealthScore
  healthImprovement?: number
  oracleAnchors?: OracleAnchorResult[]
  legs: RebalanceLeg[]
  timestamp: number
  source: string
  onchainReport?: {
    receiver: string
    status: string
    txHash?: string
  }
}

export interface PrivateTradeResult {
  action: "PRIVATE_TRADE_RESULT"
  requestId?: string
  tokenIn?: string
  tokenOut?: string
  amountIn?: string
  quoteAmount: string
  chainlinkPrice: string
  privacyMode: boolean
  status: string
  txHash?: string
  timestamp: number
  source: string
  executionProof?: {
    venue1?: { name: string; quote: string }
    venue2?: { name: string; quote: string }
    selectedVenue: string
    savings: string
    savingsBps?: string
    venueCount?: number
    routingMode?: string
    oracleReferenceQuote?: string
    oracleDeviationBps?: string
  }
  onchainReport?: {
    receiver: string
    status: string
    txHash?: string
  }
}

export interface IncomingTransfer {
  action: "INCOMING_TRANSFER"
  walletHash?: string
  from: string
  to: string
  amount: string
  token: string
  contractAddress: string
  blockNumber: string
  txHash: string
  timestamp: number
  source: string
}

export interface ExecuteApprovalResult {
  action: "EXECUTE_APPROVAL"
  requestId: string
  approved: boolean
  reason: string
  tokenIn: string
  tokenOut: string
  amount: number
  slippageBps: number
  secretId: string
  sheetId: string
  chainlinkPrice: string
  tokenInPrice: string
  tokenOutPrice: string
  priceDecimals: number
  planLegId?: string
  rebalancePlanId?: string
  executionRequestId: string
  executionAttestationId: string
  approvedPayloadHash: string
  selectedVenue?: string
  privacyMode?: boolean
  timestamp: number
  source: string
  onchainReport?: {
    receiver: string
    status: string
    txHash?: string
  }
}

export type WebhookPayload =
  | PortfolioUpdate
  | RebalancePlanResult
  | PrivateTradeResult
  | IncomingTransfer
  | ExecuteApprovalResult

export interface SheetConfig {
  spreadsheetId: string
  walletAddress: string
  privacyMode: boolean
  network: string
}

export interface SnapshotReadResponse {
  walletHash: string
  totalValueUsd: string
  dotPrice?: string
  usdtPrice?: string
  wethPrice?: string
  timestamp?: string
  snapshotWalletHash?: string
  source: string
  network: string
  dataSource: string
}

// ── Treasury Desk: Risk Rules ──────────────────────────────

export interface RiskRules {
  maxSlippageBps: number        // e.g. 200 = 2%
  allowedAssets: string[]       // e.g. ["DOT","USDT","WETH"]
  minStableReserveUsd: number   // e.g. 500 — keep at least $500 in stables
  maxSingleAssetPct: number     // e.g. 60 — no single token > 60% of portfolio
  cooldownMinutes: number       // e.g. 5 — min minutes between executions
  maxDailyVolumeUsd: number     // e.g. 10000 — daily trading limit
  maxDriftPct: number           // e.g. 15 — max drift % before auto-rebalance triggers
}

export const DEFAULT_RISK_RULES: RiskRules = {
  maxSlippageBps: 200,
  allowedAssets: ["DOT", "USDT", "WETH"],
  minStableReserveUsd: 500,
  maxSingleAssetPct: 60,
  cooldownMinutes: 5,
  maxDailyVolumeUsd: 10000,
  maxDriftPct: 15,
}

// ── Treasury Desk: Rebalance ───────────────────────────────

export interface RebalanceTarget {
  token: string
  targetPct: number
}

export interface RebalanceLeg {
  planLegId: string
  tokenIn: string
  tokenOut: string
  amount: number
  reason: string
  rebalanceId: string
  confidence?: string
  predictedDriftImprovementPct?: number
}

export interface RebalancePlan {
  rebalancePlanId: string
  walletHash?: string
  command?: string
  decisionMode?: string
  selectedCandidateId?: string
  status: string
  confidence: string
  summary: string
  rationale: string[]
  warnings?: string[]
  currentAllocations: Record<string, number>
  targetAllocations: Record<string, number>
  predictedAllocations: Record<string, number>
  policyChecks: PolicyCheckResult[]
  candidates?: RebalanceCandidateResult[]
  healthBefore?: PortfolioHealthScore
  healthAfter?: PortfolioHealthScore
  healthImprovement?: number
  oracleAnchors?: OracleAnchorResult[]
  legs: RebalanceLeg[]
}

export interface PortfolioHealthScore {
  driftScore: number
  reserveScore: number
  concentrationScore: number
  actionabilityScore: number
  overall: number
}

export interface OracleAnchorResult {
  token: string
  pricePair: string
  rawPrice: string
}

export interface RebalanceCandidateResult {
  candidateId: string
  label: string
  selected: boolean
  confidence: string
  summary: string
  rationale: string[]
  warnings: string[]
  legCount: number
  policyPassCount: number
  policyFailCount: number
  healthScore: number
  healthImprovement: number
}

// ── Treasury Desk: Approval Record ────────────────────────

export interface ApprovalRecord {
  timestamp: string
  rebalanceId: string
  action: string
  policyResult: string
  verification: string
  privacyMode: boolean
  txHash: string
}

// ── Explainable AI Trade Memo ─────────────────────────────

export interface TradeMemo {
  timestamp: string
  memoId: string
  action: string
  tokenIn: string
  tokenOut: string
  amount: string
  triggerSource: string          // "ai-trade-executor" | "rebalance" | "manual"
  chainlinkPrice: string        // Oracle price at time of trade
  policyChecks: PolicyCheckResult[]
  driftBefore?: Record<string, number>  // token -> drift% before trade
  rationale: string             // human-readable explanation
  outcome: string               // "APPROVED" | "REJECTED" | "PENDING"
}

export interface PolicyCheckResult {
  rule: string
  value: string
  limit: string
  passed: boolean
}

// ── After-Trade Reconciliation ────────────────────────────

export interface AllocationSnapshot {
  totalValueUsd: number
  allocations: Record<string, number>  // token -> pct
  prices: Record<string, number>       // pair -> price
  timestamp: number
}

export interface ReconciliationRecord {
  timestamp: string
  tradeRef: string               // txHash or rebalanceId
  before: AllocationSnapshot
  after: AllocationSnapshot
  driftReduction: Record<string, number>  // token -> pct improvement
  netImpactUsd: number
  status: string                 // "RECONCILED" | "PENDING_AFTER"
}

// ── Treasury Crisis Autopilot ─────────────────────────────

export interface TreasuryAlert {
  timestamp: string
  alertId: string
  alertType: "DRIFT" | "CONCENTRATION" | "STABLE_LOW" | "VOLUME_SPIKE"
  severity: "INFO" | "WARN" | "CRITICAL"
  token?: string
  currentValue: string
  threshold: string
  message: string
  autoAction?: string            // "REBALANCE_STAGED" | "ALERT_ONLY"
  rebalanceId?: string
}

// ── Private Best-Execution Router ─────────────────────────

export interface ExecutionProof {
  timestamp: string
  proofId: string
  executionAttestationId?: string
  approvedPayloadHash?: string
  tokenIn: string
  tokenOut: string
  amount: string
  venues: VenueQuote[]
  selectedVenue: string
  chainlinkPrice: string
  savingsVsBestPublic: string
  privacyMode: boolean
  oracleReferenceQuote?: string
  oracleDeviationBps?: string
  routingMode?: string
  venueCount?: number
}

export interface VenueQuote {
  venue: string
  quoteAmount: string
  responseTimeMs: number
  selected: boolean
}

export interface ExecutionTranscriptRow {
  timestamp: string
  requestId: string
  source: string
  command: string
  parsedAction: string
  workflow: string
  status: string
  cliCommand: string
  cliOutput: string
  txHash: string
  explorerUrl: string
  result: string
}
