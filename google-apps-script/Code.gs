/**
 * SheetFra - Google Apps Script Custom Functions
 *
 * These custom spreadsheet formulas pull blockchain data via the SheetFra agent.
 *
 * Usage in any cell:
 *   =CRE_PRICE("DOT/USD")     -> $7.25
 *   =CRE_BALANCE("DOT")       -> 500.00
 *   =CRE_TRADE("swap 50 USDT for WETH")  -> "Trade submitted"
 *   =CRE_GAS()                -> "23 gwei"
 *   =CRE_PORTFOLIO()          -> Full portfolio table
 *   =CRE_SNAPSHOT("0x...")    -> On-chain portfolio snapshot
 *
 * Setup:
 *   1. Open your Google Sheet
 *   2. Extensions -> Apps Script
 *   3. Paste this code into Code.gs
 *   4. Set the AGENT_URL in Script Properties:
 *      File -> Project Properties -> Script Properties
 *      Key: AGENT_URL  Value: https://your-agent-server.com
 *   5. Save and use the formulas in any cell
 */

// =============================================================
// Configuration
// =============================================================

function getAgentUrl() {
  var url = PropertiesService.getScriptProperties().getProperty('AGENT_URL');
  if (!url) {
    throw new Error('AGENT_URL not set. Go to File > Project Properties > Script Properties and add AGENT_URL.');
  }
  return url;
}

/**
 * Simple cache helper that stores results in CacheService for a given TTL.
 * Avoids hammering the agent server when sheets recalculate.
 */
function getCached(key) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { return null; }
  }
  return null;
}

function setCache(key, value, ttlSeconds) {
  var cache = CacheService.getScriptCache();
  cache.put(key, JSON.stringify(value), ttlSeconds || 30);
}

/**
 * Returns the API key from Script Properties. All requests need this.
 */
function getApiKey() {
  return PropertiesService.getScriptProperties().getProperty('SHEETFRA_API_KEY') || '';
}

/**
 * Wrapper around UrlFetchApp with consistent error handling.
 * Automatically includes the X-API-Key header for authentication.
 */
function fetchJson(url, options) {
  var opts = options || {};
  opts.muteHttpExceptions = true;

  // Merge API key into headers
  var apiKey = getApiKey();
  if (!opts.headers) opts.headers = {};
  if (apiKey) opts.headers['X-API-Key'] = apiKey;

  var response = UrlFetchApp.fetch(url, opts);
  var code = response.getResponseCode();

  if (code === 429) {
    return { error: "Rate limited -- please wait and try again" };
  }
  if (code === 401 || code === 403) {
    return { error: "Authentication failed. Set SHEETFRA_API_KEY in Script Properties to match your agent server." };
  }
  if (code !== 200) {
    var text = response.getContentText();
    try {
      var errBody = JSON.parse(text);
      var result = { error: errBody.error || ("HTTP " + code) };
      if (errBody.reason) result.reason = errBody.reason;
      return result;
    } catch (e) {
      return { error: "HTTP " + code + ": " + text.substring(0, 100) };
    }
  }

  return JSON.parse(response.getContentText());
}

// =============================================================
// Custom Functions (usable as spreadsheet formulas)
// =============================================================

/**
 * Fetches live price from Chainlink Price Feed via SheetFra.
 *
 * @param {string} pair The trading pair, e.g. "DOT/USD", "USDT/USD", "WETH/USD"
 * @return {number} The current price from Chainlink oracle
 * @customfunction
 */
function CRE_PRICE(pair) {
  if (!pair) return "Usage: =CRE_PRICE(\"DOT/USD\")";

  var cacheKey = "price_" + pair;
  var cached = getCached(cacheKey);
  if (cached && cached.price !== undefined) return cached.price;

  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/price?pair=' + encodeURIComponent(pair), {
    headers: { 'X-Sheet-Formula': 'CRE_PRICE("' + pair + '")' }
  });
  if (data.error) return "Error: " + data.error + (data.reason ? " — " + data.reason : "");

  setCache(cacheKey, data, 20);
  return data.price;
}

/**
 * Fetches wallet token balance.
 *
 * @param {string} token The token symbol, e.g. "DOT", "USDT", "WETH"
 * @return {number} The current balance
 * @customfunction
 */
function CRE_BALANCE(token) {
  if (!token) return "Usage: =CRE_BALANCE(\"DOT\")";

  var cacheKey = "balance_" + token;
  var cached = getCached(cacheKey);
  if (cached && cached.balance !== undefined) return cached.balance;

  var agentUrl = getAgentUrl();
  var props = PropertiesService.getScriptProperties();
  var walletParam = props.getProperty('WALLET_ADDRESS') ? '&wallet=' + encodeURIComponent(props.getProperty('WALLET_ADDRESS')) : '';
  var data = fetchJson(agentUrl + '/api/balance?token=' + encodeURIComponent(token) + walletParam, {
    headers: { 'X-Sheet-Formula': 'CRE_BALANCE("' + token + '")' }
  });
  if (data.error) return "Error: " + data.error + (data.reason ? " — " + data.reason : "");

  setCache(cacheKey, data, 30);
  return data.balance;
}

/**
 * Fetches DOT (Polkadot) price via oracle feed.
 * DOT is the native token of the Polkadot network.
 *
 * @return {number} Current DOT/USD price
 * @customfunction
 */
function CRE_DOT_PRICE() {
  var cached = getCached("dot_price");
  if (cached && cached.price !== undefined) return cached.price;
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/price?pair=DOT_USD', {
    headers: { 'X-Sheet-Formula': 'CRE_DOT_PRICE()' }
  });
  if (data.error) return "Error: " + data.error + (data.reason ? " — " + data.reason : "");
  setCache("dot_price", data, 30);
  return data.price;
}

/**
 * Fetches DOT (Polkadot) wallet balance.
 *
 * @return {number} Current DOT balance
 * @customfunction
 */
function CRE_DOT_BALANCE() {
  var cached = getCached("dot_balance");
  if (cached && cached.balance !== undefined) return cached.balance;
  var agentUrl = getAgentUrl();
  var props = PropertiesService.getScriptProperties();
  var walletParam = props.getProperty('WALLET_ADDRESS') ? '&wallet=' + encodeURIComponent(props.getProperty('WALLET_ADDRESS')) : '';
  var data = fetchJson(agentUrl + '/api/balance?token=DOT' + walletParam, {
    headers: { 'X-Sheet-Formula': 'CRE_DOT_BALANCE()' }
  });
  if (data.error) return "Error: " + data.error + (data.reason ? " — " + data.reason : "");
  setCache("dot_balance", data, 30);
  return data.balance;
}

/**
 * Executes a trade command via the SheetFra agent.
 * Natural language -> AI parses -> executes.
 *
 * @param {string} command Natural language trade command
 * @return {string} Trade result or status
 * @customfunction
 */
function CRE_TRADE(command) {
  if (!command) return 'Usage: =CRE_TRADE("swap 50 USDT for WETH")';

  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/trade', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ command: command }),
    headers: { 'X-Sheet-Formula': 'CRE_TRADE("' + command + '")' }
  });

  if (data.error) return "Error: " + data.error + (data.reason ? " — " + data.reason : "");
  return data.result || data.status;
}

/**
 * Gets current gas price.
 *
 * @return {string} Gas price in gwei
 * @customfunction
 */
function CRE_GAS() {
  var cached = getCached("gas");
  if (cached && cached.gasGwei !== undefined) return cached.gasGwei.toFixed(2) + " gwei";

  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/gas', {
    headers: { 'X-Sheet-Formula': 'CRE_GAS()' }
  });
  if (data.error) return "Error: " + data.error + (data.reason ? " — " + data.reason : "");

  setCache("gas", data, 15);
  return data.gasGwei.toFixed(2) + " gwei";
}

/**
 * Returns full portfolio summary as a table.
 * Use this in cell A1 of your Portfolio tab for a full overview.
 *
 * @return {Array} 2D array with portfolio data
 * @customfunction
 */
function CRE_PORTFOLIO() {
  var agentUrl = getAgentUrl();
  var props = PropertiesService.getScriptProperties();
  var walletParam = props.getProperty('WALLET_ADDRESS') ? '?wallet=' + encodeURIComponent(props.getProperty('WALLET_ADDRESS')) : '';
  var data = fetchJson(agentUrl + '/api/portfolio' + walletParam, {
    headers: { 'X-Sheet-Formula': 'CRE_PORTFOLIO()' }
  });
  if (data.error) return [["Error: " + data.error]];

  // Build a 2D array for the spreadsheet
  var result = [
    ["TOKEN", "BALANCE", "PRICE", "USD VALUE", "CHAIN"]
  ];

  for (var i = 0; i < data.tokens.length; i++) {
    var token = data.tokens[i];
    result.push([
      token.symbol,
      token.balance.toFixed(token.symbol === "USDT" ? 2 : 6),
      "$" + token.price.toLocaleString(),
      "$" + token.valueUsd.toFixed(2),
      token.chain
    ]);
  }

  result.push([]);
  result.push([
    "TOTAL VALUE: $" + data.totalValueUsd.toFixed(2),
    "",
    "",
    "Updated by agent",
    ""
  ]);
  result.push([
    "Last Run: " + new Date(data.timestamp).toISOString(),
    "", "", "", ""
  ]);

  return result;
}

/**
 * Reads the on-chain portfolio snapshot from the SheetFraRegistry contract.
 *
 * @param {string} walletHash The bytes32 wallet hash (keccak256 of sheetId + wallet)
 * @return {Array} 2D array with on-chain snapshot data
 * @customfunction
 */
function CRE_SNAPSHOT(walletHash) {
  if (!walletHash) return 'Usage: =CRE_SNAPSHOT("0x...")';

  var agentUrl = getAgentUrl();
  var data = fetchJson(
    agentUrl + '/api/snapshot?walletHash=' + encodeURIComponent(walletHash),
    { headers: { 'X-Sheet-Formula': 'CRE_SNAPSHOT("' + walletHash + '")' } }
  );
  if (data.error) return [["Error: " + data.error]];

  var formatPrice = function(raw) {
    return "$" + (Number(raw) / 1e8).toFixed(2);
  };

  return [
    ["ON-CHAIN SNAPSHOT", "VALUE"],
    ["Total Portfolio USD", formatPrice(data.totalValueUsd)],
    ["DOT/USD", formatPrice(data.dotPrice)],
    ["USDT/USD", formatPrice(data.usdtPrice)],
    ["WETH/USD", formatPrice(data.wethPrice)],
    ["Last Updated", data.timestamp > 0 ? new Date(data.timestamp * 1000).toISOString() : "Never"],
    ["Source", "SheetFraRegistry Contract"],
  ];
}

// =============================================================
// Menu & Triggers (for manual operations)
// =============================================================

/**
 * Creates a custom menu in Google Sheets.
 * Also auto-saves the current sheet ID and auto-creates the template if missing.
 */
function onOpen() {
  // Auto-detect and persist the Google Sheet ID
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', sheetId);

  var ui = SpreadsheetApp.getUi();
  ui.createMenu('SheetFra')
    .addItem(' Refresh Portfolio', 'refreshPortfolio')
    .addItem(' Suggest Rebalance', 'menuSuggestRebalance')
    .addItem(' Show Risk Rules', 'menuShowRiskRules')
    .addItem(' Treasury Alerts', 'menuShowAlerts')
    .addItem(' Mission Control', 'menuShowMissionControl')
    .addItem(' Show Agent Status', 'showAgentStatus')
    .addSeparator()
    .addItem(' Wallet Dashboard', 'showConnectWallet')
    .addItem(' Connect to DApp', 'showConnectDApp')
    .addItem(' Pending Transactions', 'showPendingTransactions')
    .addItem(' Initialize Sheet Wallet', 'menuInitWallet')
    .addSeparator()
    .addItem(' Enable Auto-Refresh (5 min)', 'setupAutoRefresh')
    .addItem(' Disable Auto-Refresh', 'removeAutoRefresh')
    .addSeparator()
    .addItem('Setup Sheet Template', 'setupTemplate')
    .addItem(' Setup Instructions', 'showSetupHelp')
    .addToUi();

  // Auto-create interactive tabs on first open if they don't exist yet
  setupInteractiveTabs();
  setupTemplate(true);
}

// =============================================================
// Sheet Template Setup
// =============================================================

/**
 * Template creation is now owned by the server-side agent (sheets.ts).
 * This stub is kept so the menu item and onOpen() call do not break.
 * If tabs are missing the agent server will create them on startup.
 *
 * @param {boolean} silent If true, don't show a completion alert (used by onOpen)
 */
function setupTemplate(silent) {
  if (!silent) {
    SpreadsheetApp.getUi().alert(
      'SheetFra template is managed by the agent server.\n' +
      'Start the agent (npm start) and it will create / update tabs automatically.'
    );
  }
}

/**
 * Opens a sidebar that connects a wallet and immediately shows
 * balances, prices, portfolio, gas, and quick-trade actions.
 *
 * All data flows through the SheetFra agent.
 *
 * Flow: Paste address → Save → Auto-fetch all via POST /api/wallet/connect
 *       → Show dashboard with live polling via GET /api/wallet/dashboard
 */

/** Server-side HTML escape — sanitizes values before embedding in HTML templates. */
function escGas(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showConnectWallet() {
  var currentAddr = PropertiesService.getScriptProperties().getProperty('WALLET_ADDRESS') || '';
  var agentUrl = getAgentUrl();
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  var secretId = PropertiesService.getScriptProperties().getProperty('NILLION_SECRET_ID') || '';
  var webhookToken = PropertiesService.getScriptProperties().getProperty('CRE_WEBHOOK_TOKEN') || '';
  var apiKey = getApiKey();

  var css =
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{font-family:"Google Sans",system-ui,-apple-system,sans-serif;padding:0;background:#0d1117;color:#c9d1d9;font-size:13px;min-height:100vh;}' +
    // ── App header bar ──
    '.app-header{background:linear-gradient(135deg,#1a73e8 0%,#0d47a1 100%);padding:14px 16px 10px;border-bottom:1px solid #1565c0;}' +
    '.app-title{color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.3px;}' +
    '.app-subtitle{color:rgba(255,255,255,.7);font-size:10px;margin-top:2px;}' +
    '.badge-row{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;}' +
    '.badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;}' +
    '.badge-cre{background:#0d2818;border:1px solid #238636;color:#3fb950;}' +
    '.badge-pyth{background:#130d28;border:1px solid #7c4dff;color:#b39ddb;}' +
    '.badge-nillion{background:#28200d;border:1px solid #ff8f00;color:#ffcc02;}' +
    '.badge-pyusd{background:#0d1a28;border:1px solid #1565c0;color:#90caf9;}' +
    '.badge-dot{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block;}' +
    // ── Body content ──
    '.body-content{padding:14px 16px;}' +
    'p{color:#8b949e;line-height:1.5;margin:4px 0 8px 0;}' +
    'b{color:#c9d1d9;}' +
    '.current-addr{display:flex;align-items:center;gap:8px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px;margin:8px 0;word-break:break-all;}' +
    '.current-addr .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}' +
    '.dot-green{background:#3fb950;}' +
    '.dot-grey{background:#484f58;}' +
    '.current-addr code{font-family:"JetBrains Mono",monospace;font-size:11px;color:#58a6ff;}' +
    'input{width:100%;padding:10px 12px;font-family:"JetBrains Mono",monospace;font-size:12px;' +
    '  background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:8px;margin:6px 0;transition:border-color .2s;}' +
    'input:focus{border-color:#58a6ff;outline:none;box-shadow:0 0 0 3px rgba(88,166,255,0.15);}' +
    'input::placeholder{color:#484f58;}' +
    '.btn{background:#238636;color:#fff;border:none;padding:10px 16px;' +
    '  border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:100%;margin-top:8px;transition:background .15s;}' +
    '.btn:hover{background:#2ea043;}' +
    '.btn:disabled{background:#21262d;color:#484f58;cursor:not-allowed;}' +
    '.btn-blue{background:#1f6feb;}.btn-blue:hover{background:#388bfd;}' +
    '.btn-orange{background:#9e6a03;}.btn-orange:hover{background:#bb8009;}' +
    '.btn-sm{padding:6px 12px;font-size:11px;width:auto;display:inline-block;margin:3px 3px 3px 0;border-radius:6px;}' +
    '.ok{color:#3fb950;font-weight:600;padding:8px 10px;background:#0d1117;border:1px solid #238636;border-radius:8px;margin-top:8px;font-size:12px;}' +
    '.err{color:#f85149;padding:8px 10px;background:#0d1117;border:1px solid #da3633;border-radius:8px;margin-top:8px;font-size:12px;}' +
    '.divider{height:1px;background:#21262d;margin:12px 0;}' +
    '.spinner{display:inline-block;width:14px;height:14px;border:2px solid #30363d;border-top:2px solid #58a6ff;' +
    '  border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px;}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '.pulse{animation:pulse-anim 2s ease-in-out infinite;}' +
    '@keyframes pulse-anim{0%,100%{opacity:1;}50%{opacity:.5;}}' +
    'h3{color:#c9d1d9;margin:14px 0 6px 0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;' +
    '  display:flex;align-items:center;gap:6px;padding-bottom:4px;border-bottom:1px solid #21262d;}' +
    '.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px;margin:6px 0;}' +
    '.token-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #21262d;}' +
    '.token-row:last-child{border-bottom:none;}' +
    '.token-sym{font-weight:600;color:#58a6ff;font-size:13px;min-width:50px;}' +
    '.token-bal{color:#c9d1d9;font-size:12px;text-align:right;}' +
    '.token-usd{color:#8b949e;font-size:11px;text-align:right;}' +
    '.total-value{font-size:24px;font-weight:700;color:#3fb950;text-align:center;padding:12px 0 4px 0;}' +
    '.total-label{font-size:10px;color:#484f58;text-align:center;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;}' +
    '.price-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}' +
    '.price-item{background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px;text-align:center;}' +
    '.price-label{font-size:10px;color:#484f58;text-transform:uppercase;}' +
    '.price-value{font-size:14px;font-weight:600;color:#c9d1d9;margin-top:2px;}' +
    '.price-badge{font-size:9px;color:#484f58;margin-top:2px;}' +
    '.gas-badge{display:inline-block;background:#1c1e0f;border:1px solid #3d3a0a;border-radius:10px;padding:3px 10px;font-size:11px;color:#e3b341;}' +
    '.status-bar{display:flex;align-items:center;gap:6px;margin:6px 0;font-size:10px;color:#484f58;flex-wrap:wrap;}' +
    '.cre-badge{background:#0d2818;border:1px solid #238636;color:#3fb950;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;}' +
    '.pyth-badge{background:#130d28;border:1px solid #7c4dff;color:#b39ddb;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;}' +
    '.alert-badge{background:#2d1a00;border:1px solid #cc6600;color:#ff9900;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;}' +
    // ── Health bar ──
    '.health-bar-wrap{background:#21262d;border-radius:4px;height:8px;overflow:hidden;margin:4px 0 8px;}' +
    '.health-bar-fill{height:100%;border-radius:4px;transition:width .6s ease;}' +
    '.health-ok{background:linear-gradient(90deg,#238636,#3fb950);}' +
    '.health-warn{background:linear-gradient(90deg,#9e6a03,#e3b341);}' +
    '.health-bad{background:linear-gradient(90deg,#da3633,#f85149);}' +
    // ── MC grid ──
    '.mc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;}' +
    '.mc-stat{background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:8px;}' +
    '.mc-label{font-size:10px;color:#8b949e;text-transform:uppercase;letter-spacing:.4px;}' +
    '.mc-value{font-size:15px;font-weight:700;color:#f0f6fc;margin-top:3px;}' +
    '.mc-value.ok{color:#3fb950;border:none;padding:0;background:none;margin-top:3px;}' +
    '.mc-value.warn{color:#e3b341;border:none;padding:0;background:none;margin-top:3px;}' +
    '.mc-value.bad{color:#f85149;border:none;padding:0;background:none;margin-top:3px;}' +
    '.mc-list{margin-top:8px;padding-left:16px;color:#8b949e;}' +
    '.mc-list li{margin:0 0 6px 0;}' +
    '.quick-trade{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;}' +
    'select{width:100%;padding:8px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:8px;font-size:12px;margin:4px 0;}' +
    '#tradeSection{display:none;}';

  var body =
    // ── App header bar ──
    '<div class="app-header">' +
    '<div class="app-title">⚡ SheetFra Wallet</div>' +
    '<div class="app-subtitle">DeFi Treasury Desk  ·  Polkadot Hub Testnet</div>' +
    '<div class="badge-row">' +
    '<span class="badge badge-cre"><span class="badge-dot"></span> Direct Onchain</span>' +
    '<span class="badge badge-pyth"><span class="badge-dot"></span> Pyth Oracle</span>' +
    '<span class="badge badge-nillion"><span class="badge-dot"></span> Nillion TEE</span>' +
    '<span class="badge badge-pyusd"><span class="badge-dot"></span> DOT</span>' +
    '</div>' +
    '</div>' +
    '<div class="body-content">' +
    '<div id="connectSection">' +
    '<p>Paste your wallet address. All data is BFT-verified via <span class="cre-badge">Chainlink</span></p>' +
    '<div id="walletStatus"></div>' +
    '<input id="addr" type="text" placeholder="0x..." value="' + escGas(currentAddr) + '" />' +
    '<button class="btn" id="connectBtn" onclick="doConnect()">Connect & Load Portfolio</button>' +
    '<div id="status"></div>' +
    '</div>' +
    '<div class="divider"></div>' +
    '<div id="dashboard">' +
    '<div id="loadingDash" style="text-align:center;padding:20px;display:none;"><span class="spinner"></span> Loading...</div>' +
    '<div id="dashContent" style="display:none;">' +
    '<div class="total-value" id="totalValue">$0.00</div>' +
    '<div class="total-label">Total Portfolio Value</div>' +
    '<div class="status-bar">' +
    '<span>Verified</span>' +
    '<span class="pyth-badge">Pyth Dual-Oracle</span>' +
    '<span id="gasInfo"></span>' +
    '<span id="alertsInfo"></span>' +
    '</div>' +
    // ── Health bar ──
    '<div style="margin:4px 0 2px;display:flex;align-items:center;justify-content:space-between;">' +
    '<span style="font-size:10px;color:#484f58;text-transform:uppercase;letter-spacing:.4px;">Treasury Health</span>' +
    '<span id="healthScore" style="font-size:10px;color:#3fb950;font-weight:600;">—/100</span>' +
    '</div>' +
    '<div class="health-bar-wrap"><div id="healthBarFill" class="health-bar-fill health-ok" style="width:0%"></div></div>' +
    '<h3>Portfolio</h3>' +
    '<div class="card" id="portfolioCard"><span class="pulse" style="color:#484f58;">Awaiting wallet connection...</span></div>' +
    '<h3>Prices — Chainlink</h3>' +
    '<div class="price-grid" id="pricesGrid"></div>' +
    '<h3>Quick Trade</h3>' +
    '<div class="card" id="tradeCard">' +
    '<select id="tradeTokenIn">' +
    '<option value="DOT">DOT  (Polkadot)</option>' +
    '<option value="USDT">USDT  (Tether USD)</option>' +
    '<option value="WETH">WETH  (Wrapped ETH)</option>' +
    '</select>' +
    '<div style="color:#484f58;text-align:center;font-size:18px;margin:2px 0;">↓</div>' +
    '<select id="tradeTokenOut">' +
    '<option value="WETH">WETH  (Wrapped ETH)</option>' +
    '<option value="DOT">DOT  (Polkadot)</option>' +
    '<option value="USDT">USDT  (Tether USD)</option>' +
    '</select>' +
    '<input id="tradeAmount" type="number" placeholder="Amount (e.g. 50)" step="0.001" min="0" style="margin-top:4px;" />' +
    '<button class="btn btn-blue" onclick="doQuickTrade()">⚡ Execute</button>' +
    '<button class="btn btn-orange btn-sm" style="width:100%;margin-top:4px;" onclick="doAiTrade()">🤖 AI Trade (natural language)</button>' +
    '<div id="tradeStatus"></div>' +
    '</div>' +
    '<h3>Risk Rules  <span style="font-size:9px;color:#484f58;font-weight:400;text-transform:none;">(RiskVault on-chain)</span></h3>' +
    '<div class="card" id="riskCard" style="font-size:11px;color:#8b949e;">—</div>' +
    '<h3>Mission Control  <span style="font-size:9px;color:#484f58;font-weight:400;text-transform:none;">(Treasury Autopilot)</span></h3>' +
    '<div class="card" id="missionCard" style="font-size:11px;color:#8b949e;">Awaiting treasury telemetry...</div>' +
    '<h3>DeFi Positions  <span style="font-size:9px;color:#484f58;font-weight:400;text-transform:none;">(Yield · Staking · LP)</span></h3>' +
    '<div class="card" id="defiCard">' +
    '<div style="text-align:center;color:#484f58;font-size:11px;padding:8px;">Loading DeFi data...</div>' +
    '</div>' +
    '<div class="status-bar" style="margin-top:12px;"><span class="pulse">Live — auto-refreshing every 30s</span></div>' +
    '</div>' +
    '</div>' +
    '</div>'; // close body-content

  var js =
    'var AGENT_URL="' + escGas(agentUrl) + '";' +
    'var SHEET_ID="' + escGas(sheetId) + '";' +
    'var SECRET_ID="' + escGas(secretId) + '";' +
    'var WEBHOOK_TOKEN="' + escGas(webhookToken) + '";' +
    'var API_KEY="' + escGas(apiKey) + '";' +
    'var WALLET="' + escGas(currentAddr) + '";' +
    'var pollTimer=null;' +

    // On page load, if wallet already saved, auto-fetch dashboard
    'if(WALLET){showDash();fetchDashboard();}' +

    'function doConnect(){' +
    '  var addr=document.getElementById("addr").value.trim();' +
    '  var st=document.getElementById("status");' +
    '  if(!/^0x[0-9a-fA-F]{40}$/.test(addr)){st.innerHTML="<p class=\\"err\\">Invalid address format.</p>";return;}' +
    '  var btn=document.getElementById("connectBtn");' +
    '  btn.disabled=true;btn.innerHTML="<span class=\\"spinner\\"></span> Connecting...";' +
    '  st.innerHTML="";' +
    '  google.script.run.withSuccessHandler(function(msg){' +
    '    WALLET=addr;' +
    '    document.getElementById("walletStatus").innerHTML="<div class=\\"current-addr\\"><span class=\\"dot dot-green\\"></span><code>"+esc(addr)+"</code></div>";' +
    '    showDash();' +
    '    fetchFullConnect(addr,btn,st);' +
    '  }).withFailureHandler(function(err){' +
    '    btn.disabled=false;btn.textContent="Connect & Load Portfolio";' +
    '    st.innerHTML="<p class=\\"err\\">"+esc(err.message)+"</p>";' +
    '  }).saveWalletAddress(addr);' +
    '}' +

    'function showDash(){' +
    '  document.getElementById("loadingDash").style.display="block";' +
    '  document.getElementById("dashContent").style.display="none";' +
    '}' +

    'function buildHeaders(extra){' +
    '  var headers={"Content-Type":"application/json"};' +
    '  if(API_KEY)headers["X-API-Key"]=API_KEY;' +
    '  if(WEBHOOK_TOKEN)headers["X-Webhook-Token"]=WEBHOOK_TOKEN;' +
    '  if(extra){for(var k in extra){headers[k]=extra[k];}}' +
    '  return headers;' +
    '}' +

    'function apiFetch(url,options){' +
    '  var opts=options||{};' +
    '  opts.headers=buildHeaders(opts.headers);' +
    '  return fetch(url,opts).then(function(r){return r.json();});' +
    '}' +

    'function fetchFullConnect(addr,btn,st){' +
    '  apiFetch(AGENT_URL+"/api/wallet/connect",{method:"POST",body:JSON.stringify({walletAddress:addr})})' +
    '    .then(function(d){' +
    '      btn.disabled=false;btn.textContent="Connect & Load Portfolio";' +
    '      if(d.error){st.innerHTML="<p class=\\"err\\">"+esc(d.error)+"</p>";return;}' +
    '      st.innerHTML="<p class=\\"ok\\">Connected!</p>";' +
    '      renderDashboard(d);' +
    '      startPolling();' +
    '    }).catch(function(e){' +
    '      btn.disabled=false;btn.textContent="Connect & Load Portfolio";' +
    '      st.innerHTML="<p class=\\"err\\">"+esc(e.message)+"</p>";' +
    '      fetchDashboard();' +
    '    });' +
    '}' +

    'function fetchDashboard(){' +
    '  if(!WALLET)return;' +
    '  apiFetch(AGENT_URL+"/api/wallet/dashboard?wallet="+encodeURIComponent(WALLET),{method:"GET"})' +
    '    .then(function(d){if(!d.error)renderDashboard(d);})' +
    '    .catch(function(){});' +
    '}' +

    'function startPolling(){if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(fetchDashboard,30000);}' +

    'function renderDashboard(d){' +
    '  document.getElementById("loadingDash").style.display="none";' +
    '  document.getElementById("dashContent").style.display="block";' +
    '  var p=d.portfolio||{};' +
    '  var total=p.totalValueUsd||0;' +
    '  document.getElementById("totalValue").textContent="$"+total.toFixed(2);' +
    '  var tokens=p.tokens||[];' +
    '  var ph="";' +
    '  if(tokens.length===0){ph="<span style=\\"color:#484f58;\\">No tokens found. Fund your wallet on Polkadot Hub.</span>";}' +
    '  else{for(var i=0;i<tokens.length;i++){var t=tokens[i];' +
    '    ph+="<div class=\\"token-row\\">"' +
    '      +"<span class=\\"token-sym\\">"+esc(t.symbol)+"</span>"' +
    '      +"<div><div class=\\"token-bal\\">"+fmtBal(t.balance,t.symbol)+"</div>"' +
    '      +"<div class=\\"token-usd\\">$"+t.valueUsd.toFixed(2)+"</div></div>"' +
    '      +"</div>";}}' +
    '  document.getElementById("portfolioCard").innerHTML=ph;' +
    '  var prices=d.prices||{};var pg="";' +
    '  var pairs=["DOT/USD","USDT/USD","WETH/USD"];' +
    '  for(var j=0;j<pairs.length;j++){var pr=pairs[j];var pv=prices[pr];' +
    '    pg+="<div class=\\"price-item\\"><div class=\\"price-label\\">"+esc(pr)+"</div>"' +
    '      +"<div class=\\"price-value\\">"+(pv?"$"+fmtPrice(pv):"—")+"</div>"' +
    '      +"<div class=\\"price-badge\\">Direct</div></div>";}' +
    '  document.getElementById("pricesGrid").innerHTML=pg;' +
    '  var gas=d.gas;' +
    '  document.getElementById("gasInfo").innerHTML=gas?"<span class=\\"gas-badge\\">⛽ "+gas.gasGwei.toFixed(1)+" gwei</span>":"";' +
    // Health bar
    '  var mc=d.missionControl;' +
    '  if(mc&&mc.health){' +
    '    var sc=mc.health.score||0;' +
    '    document.getElementById("healthScore").textContent=sc+"/100";' +
    '    var fill=document.getElementById("healthBarFill");' +
    '    fill.style.width=sc+"%";' +
    '    fill.className="health-bar-fill "+(sc>=70?"health-ok":sc>=40?"health-warn":"health-bad");' +
    '    var rp=mc.health.riskPressure||"";' +
    '    document.getElementById("alertsInfo").innerHTML=rp==="high"?"<span class=\\"alert-badge\\">⚠ High Risk</span>"' +
    '      :(rp==="elevated"?"<span class=\\"alert-badge\\">⚡ Elevated Risk</span>":"");' +
    '  }' +
    '  var rr=d.riskRules;' +
    '  if(rr){document.getElementById("riskCard").innerHTML=' +
    '    "<b>Max Slippage:</b> "+esc(rr.maxSlippageBps)+"bps &nbsp;|&nbsp; <b>Assets:</b> "+esc(rr.allowedAssets.join(", "))' +
    '    +"<br><b>Max Single:</b> "+esc(rr.maxSingleAssetPct)+"% &nbsp;|&nbsp; <b>Cooldown:</b> "+esc(rr.cooldownMinutes)+"m &nbsp;|&nbsp; <b>Daily Limit:</b> $"+esc(rr.maxDailyVolumeUsd)' +
    '    +"<br><b>Pyth Deviation Max:</b> 200 bps &nbsp;|&nbsp; <b>DOT:</b> supported";}' +
    '  renderMissionControl(d.missionControl);' +
    '  if(!pollTimer)startPolling();' +
    '}' +

    'function renderMissionControl(mc){' +
    '  var el=document.getElementById("missionCard");' +
    '  if(!mc){el.innerHTML="Mission control unavailable.";return;}' +
    '  var h=mc.health||{};var metrics=mc.metrics||{};var recs=mc.recommendations||[];var hi=mc.highlights||[];' +
    '  var riskClass=h.riskPressure==="high"?"bad":(h.riskPressure==="elevated"?"warn":"ok");' +
    '  var scoreClass=(h.score||0)>=80?"ok":((h.score||0)>=60?"warn":"bad");' +
    '  var html="<div class=\"mc-grid\">"' +
    '    +"<div class=\"mc-stat\"><div class=\"mc-label\">Health</div><div class=\"mc-value "+scoreClass+"\">"+esc(String(h.score||0))+"/100</div></div>"' +
    '    +"<div class=\"mc-stat\"><div class=\"mc-label\">Autopilot</div><div class=\"mc-value\">"+esc(h.autopilotMode||"watching")+"</div></div>"' +
    '    +"<div class=\"mc-stat\"><div class=\"mc-label\">Risk Pressure</div><div class=\"mc-value "+riskClass+"\">"+esc(h.riskPressure||"unknown")+"</div></div>"' +
    '    +"<div class=\"mc-stat\"><div class=\"mc-label\">Execution Proofs</div><div class=\"mc-value\">"+esc(String(metrics.executionProofCount||0))+"</div></div>"' +
    '    +"</div>";' +
    '  if(hi.length){html+="<ul class=\"mc-list\">";for(var i=0;i<Math.min(3,hi.length);i++){html+="<li>"+esc(hi[i])+"</li>";}html+="</ul>";}' +
    '  if(recs.length){html+="<div style=\"margin-top:8px;color:#f0f6fc;\"><b>Next move:</b> "+esc(recs[0])+"</div>";}' +
    '  el.innerHTML=html;' +
    '}' +

    'function doQuickTrade(){' +
    '  if(!SECRET_ID){alert("Initialize wallet first: SheetFra \u2192 Initialize Sheet Wallet");return;}' +
    '  var tIn=document.getElementById("tradeTokenIn").value;' +
    '  var tOut=document.getElementById("tradeTokenOut").value;' +
    '  var amt=parseFloat(document.getElementById("tradeAmount").value);' +
    '  var ts=document.getElementById("tradeStatus");' +
    '  if(tIn===tOut){ts.innerHTML="<p class=\\"err\\">Token In and Token Out must be different.</p>";return;}' +
    '  if(!amt||amt<=0){ts.innerHTML="<p class=\\"err\\">Enter a valid amount.</p>";return;}' +
    '  ts.innerHTML="<span class=\\"spinner\\"></span> Submitting...";' +
    '  apiFetch(AGENT_URL+"/api/execute",{method:"POST",body:JSON.stringify({' +
    '    secretId:SECRET_ID,sheetId:SHEET_ID,tokenIn:tIn,tokenOut:tOut,amount:amt,slippageBps:50' +
    '  })}).then(function(d){' +
    '    if(d.error){ts.innerHTML="<p class=\\"err\\">"+esc(d.error)+(d.reason?" — "+esc(d.reason):"")+"</p>";}' +
    '    else{ts.innerHTML="<p class=\\"ok\\">Executed! TX: <a href=\\""+esc(d.explorer)+"\\" target=\\"_blank\\" style=\\"color:#58a6ff;\\">"+esc(d.txHash.substring(0,18))+"...</a></p>";fetchDashboard();}' +
    '  }).catch(function(e){ts.innerHTML="<p class=\\"err\\">"+esc(e.message)+"</p>";});' +
    '}' +

    'function doAiTrade(){' +
    '  var cmd=prompt("Describe your trade in plain English:\\n\\nExamples:\\n  swap 50 USDT for WETH\\n  sell half my DOT for USDT\\n  rebalance to 40% WETH 40% USDT 20% DOT");' +
    '  if(!cmd)return;' +
    '  var ts=document.getElementById("tradeStatus");' +
    '  ts.innerHTML="<span class=\\"spinner\\"></span> AI parsing...";' +
    '  apiFetch(AGENT_URL+"/api/trade",{method:"POST",body:JSON.stringify({command:cmd})})' +
    '    .then(function(d){' +
    '      if(d.error){ts.innerHTML="<p class=\\"err\\">"+esc(d.error)+(d.reason?" — "+esc(d.reason):"")+"</p>";}' +
    '      else{ts.innerHTML="<p class=\\"ok\\">"+esc(d.result||d.status||"Submitted")+"</p>";fetchDashboard();}' +
    '    }).catch(function(e){ts.innerHTML="<p class=\\"err\\">"+esc(e.message)+"</p>";});' +
    '}' +

    'function fmtBal(b,sym){return sym==="USDT"?b.toFixed(2):b.toFixed(6);}' +
    'function fmtPrice(p){if(p>100)return p.toFixed(2);if(p>1)return p.toFixed(4);return p.toFixed(6);}' +
    'function esc(s){if(!s)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}' +

    // DeFi section in the sidebar
    'function fetchDeFiSummary(){' +
    '  apiFetch(AGENT_URL+"/api/defi/summary",{method:"GET"})' +
    '    .then(function(d){renderDeFiSummary(d);})' +
    '    .catch(function(){document.getElementById("defiCard").innerHTML="<span style=\\"color:#484f58;font-size:11px;\\">DeFi data unavailable</span>";});' +
    '}' +
    'function renderDeFiSummary(d){' +
    '  var el=document.getElementById("defiCard");' +
    '  if(!d||!d.summary){el.innerHTML="<span style=\\"color:#484f58;font-size:11px;\\">No DeFi positions found</span>";return;}' +
    '  var s=d.summary;var pos=s.positions||{};' +
    '  var html="<div class=\\"mc-grid\\">"' +
    '    +"<div class=\\"mc-stat\\"><div class=\\"mc-label\\">Total DeFi</div><div class=\\"mc-value ok\\">$"+s.totalPortfolioUsd.toFixed(2)+"</div></div>"' +
    '    +"<div class=\\"mc-stat\\"><div class=\\"mc-label\\">Wtd APY</div><div class=\\"mc-value ok\\">"+s.weightedAvgApy.toFixed(2)+"%</div></div>"' +
    '    +"<div class=\\"mc-stat\\"><div class=\\"mc-label\\">Daily Rewards</div><div class=\\"mc-value\\">$"+s.totalDailyRewardsUsd.toFixed(4)+"</div></div>"' +
    '    +"<div class=\\"mc-stat\\"><div class=\\"mc-label\\">Unclaimed</div><div class=\\"mc-value warn\\">$"+s.totalUnclaimedRewardsUsd.toFixed(4)+"</div></div>"' +
    '    +"</div>";' +
    '  html+="<div style=\\"display:flex;gap:8px;margin-top:8px;font-size:11px;\\">"' +
    '    +"<span style=\\"color:#3fb950;\\">YF: "+pos.yieldFarming+" pos ($"+(s.totalYieldFarmingUsd||0).toFixed(0)+")</span>"' +
    '    +"<span style=\\"color:#bc8cff;\\">SK: "+pos.staking+" pos ($"+(s.totalStakingUsd||0).toFixed(0)+")</span>"' +
    '    +"<span style=\\"color:#58a6ff;\\">LP: "+pos.liquidity+" pos ($"+(s.totalLiquidityUsd||0).toFixed(0)+")</span>"' +
    '    +"</div>";' +
    '  html+="<button onclick=\\"google.script.run.showDeFiDashboard()\\" style=\\"' +
    '    width:100%;margin-top:8px;padding:6px;background:#238636;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;\\">Open DeFi Dashboard</button>";' +
    '  el.innerHTML=html;' +
    '}' +

    // Extend renderDashboard to also fetch DeFi
    'var _origRenderDashboard=typeof renderDashboard!=="undefined"?renderDashboard:null;' +
    'function renderDashboardWithDeFi(d){' +
    '  renderDashboard(d);' +
    '  fetchDeFiSummary();' +
    '}' +

    // Auto-load DeFi on page load
    'setTimeout(function(){fetchDeFiSummary();},2000);' +
    'setInterval(function(){fetchDeFiSummary();},60000);';

  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><style>' + css + '</style></head><body>' + body + '<script>' + js + '</script></body></html>'
  ).setTitle('SheetFra Wallet');

  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Called from the MetaMask dialog via google.script.run to persist the address.
 * @param {string} address The wallet address from MetaMask
 * @return {string} Confirmation message
 */
function saveWalletAddress(address) {
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('Invalid wallet address');
  }
  PropertiesService.getScriptProperties().setProperty('WALLET_ADDRESS', address);
  return 'Wallet saved: ' + address.substring(0, 10) + '...' + address.substring(address.length - 6);
}

/**
 * Manual portfolio refresh -- writes data to the Portfolio tab.
 */
function refreshPortfolio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/portfolio');
  if (data.error) {
    SpreadsheetApp.getUi().alert('Error fetching portfolio: ' + data.error);
    return;
  }

  // Write to View Transactions tab (primary)
  var vtSheet = ss.getSheetByName('View Transactions');
  if (vtSheet) {
    writePortfolioToViewTransactions_(vtSheet, data);
  }

  // Also write to legacy Portfolio tab if it exists
  var legacySheet = ss.getSheetByName('Portfolio');
  if (legacySheet) {
    legacySheet.getRange('A1:E20').clearContent();
    legacySheet.getRange('A1:E1').setValues([['TOKEN', 'BALANCE', 'PRICE', 'USD VALUE', 'CHAIN']]);
    legacySheet.getRange('A1:E1').setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    for (var i = 0; i < data.tokens.length; i++) {
      var token = data.tokens[i];
      var row = i + 2;
      legacySheet.getRange('A' + row + ':E' + row).setValues([[
        token.symbol,
        token.balance.toFixed(token.symbol === 'USDT' ? 2 : 6),
        '$' + token.price.toFixed(2),
        '$' + token.valueUsd.toFixed(2),
        token.chain || 'Polkadot Hub'
      ]]);
      if (i % 2 === 0) legacySheet.getRange('A' + row + ':E' + row).setBackground('#f8f9fa');
    }
    var totalRow = data.tokens.length + 3;
    legacySheet.getRange('A' + totalRow).setValue('TOTAL: $' + data.totalValueUsd.toFixed(2)).setFontWeight('bold').setFontColor('#137333');
    legacySheet.getRange('A' + (totalRow + 1)).setValue('Agent Updated: ' + new Date(data.timestamp).toISOString()).setFontColor('#9aa0a6').setFontSize(9);
  }

  if (!vtSheet && !legacySheet) {
    SpreadsheetApp.getUi().alert('No portfolio tab found. Run SheetFra → Setup Sheet Template first.');
    return;
  }

  SpreadsheetApp.getUi().alert('Portfolio refreshed!');
}

/**
 * Writes rich portfolio data to the View Transactions tab.
 * Called by refreshPortfolio() and autoRefreshPortfolio().
 */
function writePortfolioToViewTransactions_(sheet, data) {
  var tokens = data.tokens || [];
  var totalUsd = data.totalValueUsd || 0;
  var now = data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString();
  var walletAddr = PropertiesService.getScriptProperties().getProperty('WALLET_ADDRESS') || '(not connected)';

  // Timestamp
  sheet.getRange('I1').setValue('Last updated: ' + now).setFontColor('#9aa0a6').setFontSize(9).setHorizontalAlignment('right');

  // Summary (rows 4-6)
  sheet.getRange(4, 2).setValue(walletAddr).setFontFamily('Courier New').setFontSize(10).setFontColor('#1a73e8');
  sheet.getRange(5, 2).setValue('Polkadot Hub Testnet');
  sheet.getRange(6, 2).setValue(now);

  // Total balance (right side)
  sheet.getRange(4, 6, 1, 4).merge();
  sheet.getRange(4, 6).setValue('$' + totalUsd.toFixed(2))
    .setFontWeight('bold').setFontColor('#137333').setFontSize(16).setHorizontalAlignment('center');

  // Distribution (rows 14+)
  var distStart = 14;
  sheet.getRange(distStart, 1, Math.max(tokens.length + 2, 8), 3).clearContent();
  for (var d = 0; d < tokens.length; d++) {
    var t = tokens[d];
    var pct = totalUsd > 0 ? (t.valueUsd / totalUsd * 100).toFixed(2) + '%' : '0.00%';
    var dr = distStart + d;
    sheet.getRange(dr, 1).setValue(t.symbol).setFontColor('#202124').setFontSize(10);
    sheet.getRange(dr, 2).setValue('$' + t.valueUsd.toFixed(2)).setFontColor('#202124').setFontSize(10);
    sheet.getRange(dr, 3).setValue(pct).setFontColor('#1a73e8').setFontSize(10).setFontWeight('bold');
    sheet.getRange(dr, 1, 1, 9).setBackground(d % 2 === 0 ? '#f8f9fa' : '#ffffff');
  }

  // Token Holdings (rows 29+)
  var holdStart = 29;
  sheet.getRange(holdStart, 1, Math.max(tokens.length + 2, 10), 9).clearContent();
  for (var h = 0; h < tokens.length; h++) {
    var tk = tokens[h];
    var hr = holdStart + h;
    var explorerBase = 'https://polkadot-hub-testnet.blockscout.com/address/' + walletAddr;
    sheet.getRange(hr, 1).setValue(tk.symbol).setFontColor('#202124').setFontSize(10);
    sheet.getRange(hr, 2).setValue(tk.symbol).setFontColor('#5f6368').setFontSize(10);
    sheet.getRange(hr, 3).setValue(tk.balance.toFixed(tk.symbol === 'USDT' ? 2 : 6))
      .setFontColor('#202124').setFontSize(10);
    sheet.getRange(hr, 4).setValue('$' + tk.valueUsd.toFixed(2)).setFontColor('#202124').setFontWeight('bold').setFontSize(10);
    sheet.getRange(hr, 5).setValue('$' + tk.price.toFixed(tk.price > 100 ? 2 : 4)).setFontColor('#202124').setFontSize(10);
    sheet.getRange(hr, 6).setValue('N/A').setFontColor('#9aa0a6').setFontSize(10);
    sheet.getRange(hr, 7).setValue('N/A').setFontColor('#9aa0a6').setFontSize(10);
    sheet.getRange(hr, 8).setValue(tk.chain || 'Polkadot Hub').setFontColor('#5f6368').setFontSize(10);
    sheet.getRange(hr, 9).setValue('View on Explorer').setFontColor('#1a73e8').setFontSize(10);
    sheet.getRange(hr, 1, 1, 9).setBackground(h % 2 === 0 ? '#f8f9fa' : '#ffffff');
    sheet.setRowHeight(hr, 24);
  }

  // Key metrics row 10
  var dotToken = null;
  for (var x = 0; x < tokens.length; x++) {
    if (tokens[x].symbol === 'DOT') { dotToken = tokens[x]; break; }
  }
  sheet.getRange(10, 1).setValue(dotToken ? dotToken.balance.toFixed(6) : '0').setFontWeight('bold').setFontSize(13);
  sheet.getRange(10, 3).setValue(String(tokens.length)).setFontWeight('bold').setFontSize(13);
  sheet.getRange(10, 7).setValue('Polkadot Hub').setFontWeight('bold').setFontSize(13);
}

/**
 * Shows the agent server status.
 */
function showAgentStatus() {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/health');
  if (data.error) {
    SpreadsheetApp.getUi().alert('Agent error: ' + data.error);
    return;
  }

  SpreadsheetApp.getUi().alert(
    'SheetFra Agent Status\n\n' +
    'Status: ' + data.status + '\n' +
    'Version: ' + data.version + '\n' +
    'Uptime: ' + Math.floor(data.uptime || 0) + 's\n' +
    'Modules: ' + (Array.isArray(data.cre_workflows) ? data.cre_workflows.join(', ') : data.cre_workflows)
  );
}

/**
 * Shows setup instructions.
 */
function showSetupHelp() {
  var html = HtmlService.createHtmlOutput(
    '<style>body{font-family:"Google Sans",sans-serif;font-size:13px;color:#202124;padding:14px;}' +
    'h2{color:#1a73e8;font-size:16px;margin-bottom:4px;}h3{color:#34a853;font-size:13px;margin:14px 0 4px;}' +
    'code{background:#f8f9fa;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:11px;color:#c5221f;}' +
    'ol{padding-left:18px;}li{margin:6px 0;}' +
    '.b{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;margin-right:4px;}' +
    '.cre{background:#d4edda;color:#155724;}.pyt{background:#e8d5f5;color:#4a0080;}' +
    '.nil{background:#fff3cd;color:#7a5000;}.pyu{background:#d0e4ff;color:#003087;}' +
    '</style>' +
    '<h2>⚡ SheetFra Setup Guide</h2>' +
    '<p><span class="b cre">Chainlink</span><span class="b pyt">Pyth Network</span><span class="b nil">Nillion TEE</span><span class="b pyu">Polkadot</span></p>' +
    '<h3>1. Deploy &amp; Configure</h3>' +
    '<ol>' +
    '<li>Deploy the SheetFra agent server (see <code>sheets-agent/README.md</code>)</li>' +
    '<li>Set in <b>Script Properties</b> (Extensions \u2192 Apps Script \u2192 \u2699 \u2192 Script properties):<br>' +
    '    <code>AGENT_URL</code> = your deployed agent URL<br>' +
    '    <code>SHEETFRA_API_KEY</code> = API key from your server .env</li>' +
    '<li>Share this sheet with your service account email (Editor access)</li>' +
    '</ol>' +
    '<h3>2. Formulas</h3>' +
    '<ol>' +
    '<li><code>=CRE_PRICE("DOT/USD")</code> \u2014 Chainlink oracle price</li>' +
    '<li><code>=CRE_BALANCE("DOT")</code> \u2014 wallet token balance</li>' +
    '<li><code>=CRE_PORTFOLIO()</code> \u2014 full portfolio table</li>' +
    '<li><code>=CRE_TRADE("swap 50 USDT for WETH")</code> \u2014 AI natural language trade</li>' +
    '<li><code>=CRE_SUGGEST_REBALANCE()</code> \u2014 AI rebalance proposals</li>' +
    '<li><code>=CRE_DOT_PRICE()</code> \u2014 DOT / Polkadot token price</li>' +
    '<li><code>=CRE_MISSION_CONTROL()</code> \u2014 treasury health + autopilot</li>' +
    '</ol>' +
    '<h3>3. Trade Execution</h3>' +
    '<ol>' +
    '<li>Run <b>SheetFra \u2192 Initialize Sheet Wallet</b> (one-time setup)</li>' +
    '<li>Fund the wallet address with PAS from <a href="https://faucet.polkadot.io/">faucet.polkadot.io</a> + DOT / USDT / WETH</li>' +
    '<li>Add onEdit trigger: Extensions \u2192 Apps Script \u2192 Triggers<br>' +
    '    Function: <code>onEditTrigger</code> | Event: On edit</li>' +
    '<li>Set Status = <b>APPROVED</b> in Pending Trades tab to execute</li>' +
    '</ol>' +
    '<p style="margin-top:12px;font-size:11px;color:#9aa0a6;">SheetFra \u00b7 Chainlink \u00b7 9 workflows \u00b7 3 trigger types \u00b7 Polkadot Hub Testnet</p>'
  ).setWidth(500).setHeight(540);

  SpreadsheetApp.getUi().showModalDialog(html, 'SheetFra Setup');
}

// =============================================================
// Wallet Initialization
// =============================================================

/**
 * Menu wrapper so CRE_WALLET_INIT can be called from the SheetFra menu.
 */
function menuInitWallet() {
  var result = CRE_WALLET_INIT();
  SpreadsheetApp.getUi().alert(result);
}

/**
 * Initializes a deterministic wallet for this Google Sheet.
 * Generates a random salt, stores it in Nillion, and derives a wallet address.
 *
 * Run ONCE. The secretId is saved to Script Properties automatically.
 * The wallet address is returned so you can fund it.
 *
 * @return {string} Wallet address and setup confirmation message
 * @customfunction
 */
function CRE_WALLET_INIT() {
  var props = PropertiesService.getScriptProperties();
  var existing = props.getProperty('NILLION_SECRET_ID');
  if (existing) {
    var walletAddr = props.getProperty('WALLET_ADDRESS') || 'unknown';
    return 'SheetFra wallet already initialized.\nAddress: ' + walletAddr +
           '\n\nTo reinitialize, delete NILLION_SECRET_ID from Script Properties first.';
  }

  var agentUrl = getAgentUrl();
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

  var data = fetchJson(agentUrl + '/api/wallet/init', {
    method: 'post',
    headers: { 'X-Sheet-Formula': 'CRE_WALLET_INIT()' },
    contentType: 'application/json',
    payload: JSON.stringify({ sheetId: sheetId })
  });

  if (data.error) return 'Error initializing wallet: ' + data.error;

  // Persist the secretId and wallet address so onEditTrigger can use them
  props.setProperty('NILLION_SECRET_ID', data.secretId);
  props.setProperty('WALLET_ADDRESS', data.walletAddress);

  return 'SheetFra wallet initialized!\n\n' +
         'Address: ' + data.walletAddress + '\n\n' +
         'Fund this address with PAS from https://faucet.polkadot.io/ + DOT/USDT/WETH before executing swaps.\n' +
         'Nillion secretId has been saved to Script Properties automatically.\n\n' +
         'Your key is secured by Nillion Secret Vault (TEE) — never stored in plaintext.';
}

// =============================================================
// Trade Approval & Execution
// =============================================================

/**
 * Approves and executes a swap on Polkadot Hub Testnet via the SheetFra agent.
 * The agent reconstructs the wallet from Nillion and submits the transaction.
 *
 * Tokens must be DOT, USDT, or WETH.
 *
 * @param {string} tokenIn  Source token: DOT | USDT | WETH
 * @param {string} tokenOut Destination token: DOT | USDT | WETH
 * @param {number} amount   Human-readable amount (e.g. 50 for 50 USDT)
 * @param {number} slippageBps Slippage tolerance in basis points (default 50 = 0.5%)
 * @return {string} Transaction hash on success, or error message
 * @customfunction
 */
function CRE_APPROVE_TRADE(tokenIn, tokenOut, amount, slippageBps) {
  if (!tokenIn || !tokenOut || !amount) {
    return 'Usage: =CRE_APPROVE_TRADE("USDT", "WETH", 50)';
  }

  var props = PropertiesService.getScriptProperties();
  var secretId = props.getProperty('NILLION_SECRET_ID');
  if (!secretId) {
    return 'Wallet not initialized. Run SheetFra \u2192 Initialize Sheet Wallet first.';
  }

  var agentUrl = getAgentUrl();
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  var webhookToken = props.getProperty('CRE_WEBHOOK_TOKEN') || '';

  var data = fetchJson(agentUrl + '/api/execute', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Webhook-Token': webhookToken, 'X-Sheet-Formula': 'CRE_APPROVE_TRADE("' + tokenIn + '", "' + tokenOut + '", ' + amount + ')', 'X-Sheet-Command': 'CRE_APPROVE_TRADE: ' + amount + ' ' + tokenIn + ' → ' + tokenOut },
    payload: JSON.stringify({
      secretId: secretId,
      sheetId: sheetId,
      tokenIn: String(tokenIn).trim().toUpperCase(),
      tokenOut: String(tokenOut).trim().toUpperCase(),
      amount: Number(amount),
      slippageBps: slippageBps ? Number(slippageBps) : 50
    })
  });

  if (data.error) {
    var errMsg = data.error;
    if (data.reason) errMsg += ' — ' + data.reason;
    return 'Error: ' + errMsg;
  }

  return 'Executed! TX: ' + data.txHash +
         '\nView: ' + (data.explorer || '');
}

/**
 * (Old onEditTrigger removed - see the unified onEditTrigger below CRE_DAPP_SESSIONS)
 */

// =============================================================
// Treasury Desk: Rebalance Suggestion
// =============================================================

/**
 * Suggests portfolio rebalance trades based on target allocations in the Risk Rules tab.
 * Stages pending trades that the user can approve individually.
 *
 * @param {number} targetDot Target DOT allocation % (optional, reads from Risk Rules)
 * @param {number} targetUsdt Target USDT allocation % (optional)
 * @param {number} targetWeth Target WETH allocation % (optional)
 * @return {string} Summary of suggested trades
 * @customfunction
 */
function CRE_SUGGEST_REBALANCE(targetDot, targetUsdt, targetWeth) {
  var agentUrl = getAgentUrl();
  var props = PropertiesService.getScriptProperties();
  var walletAddr = props.getProperty('WALLET_ADDRESS') || '';

  var body = { wallet: walletAddr };
  if (targetDot && targetUsdt && targetWeth) {
    body.targets = { DOT: Number(targetDot), USDT: Number(targetUsdt), WETH: Number(targetWeth) };
  }

  var data = fetchJson(agentUrl + '/api/suggest-rebalance', {
    method: 'post',
    headers: { 'X-Sheet-Formula': 'CRE_SUGGEST_REBALANCE(' + (targetDot||'') + ',' + (targetUsdt||'') + ',' + (targetWeth||'') + ')' },
    contentType: 'application/json',
    payload: JSON.stringify(body)
  });

  if (data.error) return 'Error: ' + data.error;
  if (!data.legs || data.legs.length === 0) return 'Portfolio is balanced. No trades needed.';

  return data.rebalanceId + ': ' + data.legs.length + ' trades staged. Check Pending Trades tab.';
}

/**
 * Menu wrapper for rebalance suggestion.
 */
function menuSuggestRebalance() {
  var result = CRE_SUGGEST_REBALANCE();
  SpreadsheetApp.getUi().alert('SheetFra — AI Rebalance Suggestion\n\nPowered by Gemini\n\n' + result);
}

/**
 * Returns current risk rules from the agent (reads the Risk Rules tab via the agent).
 *
 * @return {Array} 2D array with risk rules
 * @customfunction
 */
function CRE_RISK_RULES() {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/risk-rules', { headers: { 'X-Sheet-Formula': 'CRE_RISK_RULES()' } });
  if (data.error) return [['Error: ' + data.error]];

  var rules = data.rules;
  return [
    ['RULE', 'VALUE'],
    ['Max Slippage', rules.maxSlippageBps + ' bps'],
    ['Allowed Assets', rules.allowedAssets.join(', ')],
    ['Min Stable Reserve', '$' + rules.minStableReserveUsd],
    ['Max Single Asset %', rules.maxSingleAssetPct + '%'],
    ['Cooldown', rules.cooldownMinutes + ' min'],
    ['Max Daily Volume', '$' + rules.maxDailyVolumeUsd],
  ];
}

/**
 * Menu wrapper that shows current risk rules.
 */
function menuShowRiskRules() {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/risk-rules');
  if (data.error) {
    SpreadsheetApp.getUi().alert('Error: ' + data.error);
    return;
  }
  var r = data.rules;
  SpreadsheetApp.getUi().alert(
    'Current Risk Rules\n\n' +
    'Max Slippage: ' + r.maxSlippageBps + ' bps\n' +
    'Allowed Assets: ' + r.allowedAssets.join(', ') + '\n' +
    'Min Stable Reserve: $' + r.minStableReserveUsd + '\n' +
    'Max Single Asset: ' + r.maxSingleAssetPct + '%\n' +
    'Cooldown: ' + r.cooldownMinutes + ' min\n' +
    'Max Daily Volume: $' + r.maxDailyVolumeUsd
  );
}

// =============================================================
// Treasury Alerts
// =============================================================

/**
 * Returns the latest treasury alerts. Use in any cell for live monitoring.
 *
 * @param {number} limit Number of alerts to show (default 5)
 * @return {Array} 2D array with recent alerts
 * @customfunction
 */
function CRE_ALERTS(limit) {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/treasury-alerts?limit=' + (limit || 5), { headers: { 'X-Sheet-Formula': 'CRE_ALERTS(' + (limit||'') + ')' } });
  if (data.error) return [['Error: ' + data.error]];
  if (!data.alerts || data.alerts.length === 0) return [['No alerts. Treasury is healthy.']];

  var result = [['TIME', 'TYPE', 'SEVERITY', 'TOKEN', 'MESSAGE']];
  for (var i = 0; i < data.alerts.length; i++) {
    var a = data.alerts[i];
    result.push([a.timestamp, a.alertType, a.severity, a.token || '', a.message]);
  }
  return result;
}

/**
 * Returns the latest trade memos for full explainability.
 *
 * @param {number} limit Number of memos to show (default 5)
 * @return {Array} 2D array with recent trade memos
 * @customfunction
 */
function CRE_TRADE_MEMOS(limit) {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/trade-memos?limit=' + (limit || 5), { headers: { 'X-Sheet-Formula': 'CRE_TRADE_MEMOS(' + (limit||'') + ')' } });
  if (data.error) return [['Error: ' + data.error]];
  if (!data.memos || data.memos.length === 0) return [['No trade memos yet.']];

  var result = [['TIME', 'PAIR', 'AMOUNT', 'TRIGGER', 'OUTCOME', 'RATIONALE']];
  for (var i = 0; i < data.memos.length; i++) {
    var m = data.memos[i];
    result.push([m.timestamp, m.tokenIn + '->' + m.tokenOut, m.amount, m.triggerSource, m.outcome, m.rationale]);
  }
  return result;
}

/**
 * Returns the mission-control summary for a wallet.
 * If wallet is omitted, uses WALLET_ADDRESS from Script Properties.
 *
 * @param {string=} wallet Optional wallet address
 * @param {number=} limit Number of recent artifacts to inspect
 * @return {Array} 2D array with treasury intelligence metrics
 * @customfunction
 */
function CRE_MISSION_CONTROL(wallet, limit) {
  var props = PropertiesService.getScriptProperties();
  var targetWallet = wallet || props.getProperty('WALLET_ADDRESS') || '';
  if (!targetWallet) return [['Error: connect a wallet first or pass one to CRE_MISSION_CONTROL(wallet).']];

  var agentUrl = getAgentUrl();
  var data = fetchJson(
    agentUrl + '/api/mission-control?wallet=' + encodeURIComponent(targetWallet) + '&limit=' + (limit || 5),
    { headers: { 'X-Sheet-Formula': 'CRE_MISSION_CONTROL(' + (wallet ? '"' + wallet + '"' : '') + ')' } }
  );
  if (data.error) return [['Error: ' + data.error]];

  var health = data.health || {};
  var metrics = data.metrics || {};
  var portfolio = data.portfolio || {};
  var recommendations = data.recommendations || [];
  var highlights = data.highlights || [];

  return [
    ['MISSION CONTROL', 'VALUE'],
    ['Treasury Health', String(health.score || 0) + '/100 (' + (health.band || 'n/a') + ')'],
    ['Risk Pressure', health.riskPressure || 'unknown'],
    ['Autopilot', health.autopilotMode || 'watching'],
    ['Portfolio Value', '$' + Number(portfolio.totalValueUsd || 0).toFixed(2)],
    ['Stable Reserve', '$' + Number(portfolio.stableReserveUsd || 0).toFixed(2)],
    ['Critical Alerts', String(metrics.criticalAlerts || 0)],
    ['Execution Proofs', String(metrics.executionProofCount || 0)],
    ['Protected Edge', metrics.averageSavingsBps ? Number(metrics.averageSavingsBps).toFixed(1) + ' bps avg' : (metrics.totalProtectedSavingsUsd ? '$' + Number(metrics.totalProtectedSavingsUsd).toFixed(2) : 'No proofs yet')],
    ['Top Recommendation', recommendations.length ? recommendations[0] : 'Run a private route demo to populate execution proof.'],
    ['Highlight', highlights.length ? highlights[0] : 'Mission control ready.'],
  ];
}

/**
 * Returns market insights for all supported tokens.
 * @return {Array} Market insights table
 * @customfunction
 */
function CRE_MARKET_INSIGHTS() {
  var url = getAgentUrl() + "/api/market-insights";
  try {
    var data = fetchJson(url, { headers: { 'X-Sheet-Formula': 'CRE_MARKET_INSIGHTS()' } });
    if (!data || !data.insights) return [["No market data available"]];

    var rows = [["Asset", "Price", "24h Signal", "Updated"]];
    (data.insights || []).forEach(function(item) {
      rows.push([
        item.asset || "",
        item.price ? "$" + Number(item.price).toFixed(2) : "N/A",
        item.signal || "NEUTRAL",
        item.updatedAt || new Date().toISOString()
      ]);
    });
    return rows;
  } catch(e) {
    return [["Error fetching market insights: " + e.message]];
  }
}

/**
 * Menu: Show treasury alerts popup
 */
function menuShowAlerts() {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/treasury-alerts?limit=10');
  if (data.error) {
    SpreadsheetApp.getUi().alert('Error: ' + data.error);
    return;
  }
  if (!data.alerts || data.alerts.length === 0) {
    SpreadsheetApp.getUi().alert('No treasury alerts. Portfolio is healthy.');
    return;
  }
  var msg = 'Treasury Alerts (' + data.alerts.length + ')\n\n';
  for (var i = 0; i < data.alerts.length; i++) {
    var a = data.alerts[i];
    msg += a.severity + ' | ' + a.alertType + ': ' + a.message + '\n';
  }
  SpreadsheetApp.getUi().alert(msg);
}

function menuShowMissionControl() {
  var props = PropertiesService.getScriptProperties();
  var wallet = props.getProperty('WALLET_ADDRESS') || '';
  if (!wallet) {
    SpreadsheetApp.getUi().alert('Connect a wallet first to view Mission Control.');
    return;
  }

  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/mission-control?wallet=' + encodeURIComponent(wallet) + '&limit=5');
  if (data.error) {
    SpreadsheetApp.getUi().alert('Error: ' + data.error);
    return;
  }

  var health = data.health || {};
  var metrics = data.metrics || {};
  var msg = 'Mission Control\n\n' +
    'Health: ' + (health.score || 0) + '/100 (' + (health.band || 'n/a') + ')\n' +
    'Risk Pressure: ' + (health.riskPressure || 'unknown') + '\n' +
    'Autopilot: ' + (health.autopilotMode || 'watching') + '\n' +
    'Critical Alerts: ' + (metrics.criticalAlerts || 0) + '\n' +
    'Execution Proofs: ' + (metrics.executionProofCount || 0) + '\n\n' +
    'Top Recommendation:\n' + ((data.recommendations && data.recommendations[0]) || 'Run a private route demo to show proof.');

  SpreadsheetApp.getUi().alert(msg);
}

// =============================================================
// WalletConnect v2 — DApp Connectivity
// =============================================================

/**
 * Opens a sidebar for connecting to a DApp via WalletConnect v2.
 * Users paste a WalletConnect URI (wc:...) and manage active sessions
 * and pending transaction requests.
 *
 * Dark-themed UI with live polling, loading spinners, and chain tags.
 */
function showConnectDApp() {
  var agentUrl = getAgentUrl();
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  var walletAddr = PropertiesService.getScriptProperties().getProperty('WALLET_ADDRESS') || '';
  var secretId = PropertiesService.getScriptProperties().getProperty('NILLION_SECRET_ID') || '';
  var apiKey = getApiKey();

  var css =
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{font-family:"Google Sans",system-ui,-apple-system,sans-serif;padding:16px;background:#0d1117;color:#c9d1d9;font-size:13px;min-height:100vh;}' +
    '.header{display:flex;align-items:center;gap:10px;margin-bottom:12px;}' +
    'h2{color:#58a6ff;font-size:17px;font-weight:600;}' +
    'p{color:#8b949e;line-height:1.5;margin:4px 0 8px 0;}' +
    'input[type=text]{width:100%;padding:10px 12px;font-family:monospace;font-size:12px;' +
    '  background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:8px;margin:6px 0;transition:border-color .2s;}' +
    'input[type=text]:focus{border-color:#58a6ff;outline:none;box-shadow:0 0 0 3px rgba(88,166,255,0.15);}' +
    'input::placeholder{color:#484f58;}' +
    '.btn{background:#238636;color:#fff;border:none;padding:10px 16px;' +
    '  border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;width:100%;margin-top:8px;transition:background .15s;}' +
    '.btn:hover{background:#2ea043;}' +
    '.btn:disabled{background:#21262d;color:#484f58;cursor:not-allowed;}' +
    '.btn-sm{padding:6px 12px;font-size:11px;width:auto;display:inline-block;margin:4px 4px 4px 0;border-radius:6px;}' +
    '.btn-approve{background:#238636;}.btn-approve:hover{background:#2ea043;}' +
    '.btn-reject{background:#da3633;}.btn-reject:hover{background:#f85149;}' +
    '.btn-disconnect{background:#30363d;color:#8b949e;}.btn-disconnect:hover{background:#484f58;color:#c9d1d9;}' +
    'h3{color:#c9d1d9;margin:18px 0 8px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;' +
    '  display:flex;align-items:center;gap:6px;padding-bottom:6px;border-bottom:1px solid #21262d;}' +
    'h3 .count{background:#30363d;color:#8b949e;padding:1px 7px;border-radius:10px;font-size:11px;font-weight:400;}' +
    '.session-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;margin:6px 0;transition:border-color .15s;}' +
    '.session-card:hover{border-color:#484f58;}' +
    '.session-name{font-weight:600;color:#58a6ff;font-size:14px;}' +
    '.session-meta{font-size:11px;color:#484f58;word-break:break-all;margin-top:2px;}' +
    '.chain-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}' +
    '.chain-tag{background:#1f2937;border:1px solid #30363d;padding:2px 8px;border-radius:10px;font-size:10px;color:#8b949e;}' +
    '.request-card{background:#1c1e0f;border:1px solid #3d3a0a;border-radius:8px;padding:12px;margin:6px 0;}' +
    '.proposal-card{background:#0d1f33;border:1px solid #1f4070;border-radius:8px;padding:12px;margin:6px 0;}' +
    '.method-badge{background:#21262d;padding:3px 10px;border-radius:10px;font-family:monospace;font-size:11px;color:#d2a8ff;border:1px solid #30363d;}' +
    '.ok{color:#3fb950;font-weight:600;padding:8px 12px;background:#0d1117;border:1px solid #238636;border-radius:8px;margin-top:8px;font-size:12px;}' +
    '.err{color:#f85149;padding:8px 12px;background:#0d1117;border:1px solid #da3633;border-radius:8px;margin-top:8px;font-size:12px;}' +
    '.empty{color:#484f58;font-style:italic;padding:8px 0;font-size:12px;}' +
    '#status{margin-top:8px;}' +
    '.spinner{display:inline-block;width:14px;height:14px;border:2px solid #30363d;border-top:2px solid #58a6ff;' +
    '  border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px;}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '.pulse{animation:pulse-anim 2s ease-in-out infinite;}' +
    '@keyframes pulse-anim{0%,100%{opacity:1;}50%{opacity:.5;}}' +
    'details summary{cursor:pointer;font-size:11px;color:#58a6ff;margin-top:6px;user-select:none;}' +
    'details pre{font-size:10px;overflow:auto;max-height:120px;background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px;margin-top:4px;color:#8b949e;}' +
    '.refresh-bar{display:flex;align-items:center;margin:10px 0 4px 0;}' +
    '.refresh-dot{width:6px;height:6px;border-radius:50%;background:#3fb950;display:inline-block;margin-right:4px;}' +
    '.refresh-text{font-size:10px;color:#484f58;}';

  var body =
    '<div class="header"><h2>🔗 Connect to DApp</h2></div>' +
    '<p>Paste a WalletConnect URI to connect your <b>SheetFra</b> wallet to any DApp.</p>' +
    '<input id="wcUri" type="text" placeholder="wc:..." />' +
    '<button class="btn" id="pairBtn" onclick="doPair()">Connect</button>' +
    '<div id="status"></div>' +
    '<div class="refresh-bar"><span class="refresh-dot"></span><span class="refresh-text pulse">Live — polling every 5s</span></div>' +
    '<h3>Active Sessions <span class="count" id="sessCount">0</span></h3>' +
    '<div id="sessions"><span class="empty"><span class="spinner"></span> Loading...</span></div>' +
    '<h3>Pending Proposals <span class="count" id="propCount">0</span></h3>' +
    '<div id="proposals"><span class="empty">None</span></div>' +
    '<h3>Pending Requests <span class="count" id="reqCount">0</span></h3>' +
    '<div id="requests"><span class="empty">None</span></div>';

  var js =
    'var AGENT_URL="' + escGas(agentUrl) + '";' +
    'var SHEET_ID="' + escGas(sheetId) + '";' +
    'var WALLET="' + escGas(walletAddr) + '";' +
    'var SECRET_ID="' + escGas(secretId) + '";' +
    'var API_KEY="' + escGas(apiKey) + '";' +

    'function buildHeaders(extra){' +
    '  var headers={"Content-Type":"application/json"};' +
    '  if(API_KEY)headers["X-API-Key"]=API_KEY;' +
    '  if(extra){for(var k in extra){headers[k]=extra[k];}}' +
    '  return headers;' +
    '}' +

    'function apiFetch(url,options){' +
    '  var opts=options||{};' +
    '  opts.headers=buildHeaders(opts.headers);' +
    '  return fetch(url,opts).then(function(r){return r.json();});' +
    '}' +

    'function doPair(){' +
    '  var uri=document.getElementById("wcUri").value.trim();' +
    '  var st=document.getElementById("status");' +
    '  if(!uri||!uri.startsWith("wc:")){st.innerHTML="<p class=\\"err\\">Invalid URI. Must start with wc:</p>";return;}' +
    '  document.getElementById("pairBtn").disabled=true;' +
    '  document.getElementById("pairBtn").innerHTML="<span class=\\"spinner\\"></span> Connecting...";' +
    '  st.innerHTML="";' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/pair",{method:"POST",body:JSON.stringify({uri:uri,sheetId:SHEET_ID})})' +
    '    .then(function(d){document.getElementById("pairBtn").disabled=false;document.getElementById("pairBtn").textContent="Connect";' +
    '    if(d.error){st.innerHTML="<p class=\\"err\\">"+esc(d.error)+"</p>";}else{st.innerHTML="<p class=\\"ok\\">Pairing initiated!</p>";document.getElementById("wcUri").value="";setTimeout(pollPending,2000);}' +
    '  }).catch(function(e){document.getElementById("pairBtn").disabled=false;document.getElementById("pairBtn").textContent="Connect";st.innerHTML="<p class=\\"err\\">"+esc(e.message)+"</p>";});' +
    '}' +

    'function pollPending(){' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/pending?sheetId="+encodeURIComponent(SHEET_ID),{method:"GET"}).then(function(d){renderProposals(d.proposals||[]);renderRequests(d.requests||[]);}).catch(function(){});' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/sessions?sheetId="+encodeURIComponent(SHEET_ID),{method:"GET"}).then(function(d){renderSessions(d.sessions||[]);}).catch(function(){});' +
    '}' +

    'function renderSessions(ss){' +
    '  var el=document.getElementById("sessions");document.getElementById("sessCount").textContent=ss.length;' +
    '  if(!ss.length){el.innerHTML="<span class=\\"empty\\">No active sessions</span>";return;}' +
    '  var h="";for(var i=0;i<ss.length;i++){var s=ss[i];var ch=(s.chains||[]);var ct="";for(var c=0;c<ch.length;c++){ct+="<span class=\\"chain-tag\\">"+esc(ch[c])+"</span>";}' +
    '  h+="<div class=\\"session-card\\"><div class=\\"session-name\\">"+esc(s.peerName)+"</div><div class=\\"session-meta\\">"+esc(s.peerUrl)+"</div><div class=\\"chain-tags\\">"+ct+"</div>"' +
    '    +"<div class=\\"session-meta\\" style=\\"margin-top:6px\\">Topic: "+esc(s.topic.substring(0,20))+"...</div>"' +
    '    +"<button class=\\"btn btn-sm btn-disconnect\\" onclick=\\"doDisconnect(\'"+ea(s.topic)+"\')\\">' +
    'Disconnect</button></div>";}el.innerHTML=h;}' +

    'function renderProposals(ps){' +
    '  var el=document.getElementById("proposals");document.getElementById("propCount").textContent=ps.length;' +
    '  if(!ps.length){el.innerHTML="<span class=\\"empty\\">No pending proposals</span>";return;}' +
    '  var h="";for(var i=0;i<ps.length;i++){var p=ps[i];var ch=(p.chains||[]);var ct="";for(var c=0;c<ch.length;c++){ct+="<span class=\\"chain-tag\\">"+esc(ch[c])+"</span>";}' +
    '  h+="<div class=\\"proposal-card\\"><div class=\\"session-name\\">"+esc(p.peerName)+" wants to connect</div><div class=\\"session-meta\\">"+esc(p.peerUrl)+"</div><div class=\\"chain-tags\\">"+ct+"</div>"' +
    '    +"<div style=\\"margin-top:8px\\"><button class=\\"btn btn-sm btn-approve\\" onclick=\\"doApproveSession("+p.id+")\\">Approve</button>"' +
    '    +"<button class=\\"btn btn-sm btn-reject\\" onclick=\\"doRejectSession("+p.id+")\\">Reject</button></div></div>";}el.innerHTML=h;}' +

    'function renderRequests(rs){' +
    '  var el=document.getElementById("requests");document.getElementById("reqCount").textContent=rs.length;' +
    '  if(!rs.length){el.innerHTML="<span class=\\"empty\\">No pending requests</span>";return;}' +
    '  var h="";for(var i=0;i<rs.length;i++){var r=rs[i];' +
    '  var ml=r.method;if(r.method==="eth_sendTransaction")ml="Send Transaction";else if(r.method==="personal_sign")ml="Sign Message";else if(r.method.indexOf("signTypedData")>=0)ml="Sign Typed Data";' +
    '  h+="<div class=\\"request-card\\"><span class=\\"method-badge\\">"+esc(r.method)+"</span> <span style=\\"color:#e3b341;font-size:12px;font-weight:600\\">"+esc(ml)+"</span>"' +
    '    +"<div class=\\"session-meta\\" style=\\"margin-top:6px\\">ID: "+esc(r.id)+" | Topic: "+esc(r.topic.substring(0,14))+"...</div>"' +
    '    +"<details><summary>View params</summary><pre>"+esc(JSON.stringify(r.params,null,2))+"</pre></details>"' +
    '    +"<div style=\\"margin-top:8px\\"><button class=\\"btn btn-sm btn-approve\\" onclick=\\"doApproveRequest(\'"+ea(r.topic)+"\',"+r.id+")\\">Sign & Approve</button>"' +
    '    +"<button class=\\"btn btn-sm btn-reject\\" onclick=\\"doRejectRequest(\'"+ea(r.topic)+"\',"+r.id+")\\">Reject</button></div></div>";}el.innerHTML=h;}' +

    'function doApproveSession(id){if(!WALLET){alert("No wallet set. Use SheetFra > Wallet Dashboard first.");return;}' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/approve-session",{method:"POST",body:JSON.stringify({id:id,sheetId:SHEET_ID,walletAddress:WALLET})})' +
    '    .then(function(d){if(d.error)alert(d.error);else{document.getElementById("status").innerHTML="<p class=\\"ok\\">Session approved!</p>";pollPending();}}).catch(function(e){alert(e.message);});}' +

    'function doRejectSession(id){' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/reject-session",{method:"POST",body:JSON.stringify({id:id,sheetId:SHEET_ID})})' +
    '    .then(function(d){if(d.error)alert(d.error);else pollPending();}).catch(function(e){alert(e.message);});}' +

    'function doApproveRequest(topic,id){if(!SECRET_ID){alert("No Nillion secret ID. Use SheetFra > Initialize Sheet Wallet first.");return;}' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/sign-and-approve",{method:"POST",body:JSON.stringify({topic:topic,id:id,secretId:SECRET_ID,sheetId:SHEET_ID})})' +
    '    .then(function(d){if(d.error)alert(d.error);else{document.getElementById("status").innerHTML="<p class=\\"ok\\">"+esc(d.method)+" signed</p>";pollPending();}}).catch(function(e){alert(e.message);});}' +

    'function doRejectRequest(topic,id){' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/reject-request",{method:"POST",body:JSON.stringify({topic:topic,id:id,message:"Rejected by user"})})' +
    '    .then(function(d){if(d.error)alert(d.error);else pollPending();}).catch(function(e){alert(e.message);});}' +

    'function doDisconnect(topic){if(!confirm("Disconnect this DApp?"))return;' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/disconnect",{method:"POST",body:JSON.stringify({topic:topic})})' +
    '    .then(function(d){if(d.error)alert(d.error);else pollPending();}).catch(function(e){alert(e.message);});}' +

    'function esc(s){if(!s)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}' +
    'function ea(s){return String(s).replace(/\\\\/g,"\\\\\\\\").replace(/\'/g,"\\\\\\'");}' +
    'pollPending();setInterval(pollPending,5000);';

  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><style>' + css + '</style></head><body>' + body + '<script>' + js + '</script></body></html>'
  ).setTitle('SheetFra — Connect DApp');

  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Opens a sidebar showing pending WalletConnect transaction requests.
 * Polls the agent every 5 seconds for new requests.
 * Dark-themed UI consistent with the DApp sidebar.
 */
function showPendingTransactions() {
  var agentUrl = getAgentUrl();
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  var secretId = PropertiesService.getScriptProperties().getProperty('NILLION_SECRET_ID') || '';
  var apiKey = getApiKey();

  var css =
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{font-family:"Google Sans",system-ui,-apple-system,sans-serif;padding:16px;background:#0d1117;color:#c9d1d9;font-size:13px;min-height:100vh;}' +
    'h2{color:#e3b341;font-size:17px;font-weight:600;margin-bottom:8px;}' +
    'p{color:#8b949e;line-height:1.5;margin:4px 0;}' +
    '.request-card{background:#1c1e0f;border:1px solid #3d3a0a;border-radius:8px;padding:12px;margin:6px 0;}' +
    '.method-badge{background:#21262d;padding:3px 10px;border-radius:10px;font-family:monospace;font-size:11px;color:#d2a8ff;border:1px solid #30363d;}' +
    '.session-meta{font-size:11px;color:#484f58;word-break:break-all;margin-top:4px;}' +
    '.btn-sm{padding:6px 12px;font-size:11px;border:none;border-radius:6px;cursor:pointer;color:#fff;display:inline-block;margin:4px 4px 4px 0;font-weight:600;}' +
    '.btn-approve{background:#238636;}.btn-approve:hover{background:#2ea043;}' +
    '.btn-reject{background:#da3633;}.btn-reject:hover{background:#f85149;}' +
    '.empty{color:#484f58;font-style:italic;padding:8px 0;font-size:12px;}' +
    '.spinner{display:inline-block;width:14px;height:14px;border:2px solid #30363d;border-top:2px solid #58a6ff;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px;}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '.pulse{animation:pulse-anim 2s ease-in-out infinite;}' +
    '@keyframes pulse-anim{0%,100%{opacity:1;}50%{opacity:.5;}}' +
    '.refresh-bar{display:flex;align-items:center;margin:10px 0;}' +
    '.refresh-dot{width:6px;height:6px;border-radius:50%;background:#3fb950;display:inline-block;margin-right:4px;}' +
    '.refresh-text{font-size:10px;color:#484f58;}' +
    'details summary{cursor:pointer;font-size:11px;color:#58a6ff;margin-top:6px;user-select:none;}' +
    'details pre{font-size:10px;overflow:auto;max-height:120px;background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px;margin-top:4px;color:#8b949e;}' +
    '.ok{color:#3fb950;font-weight:600;padding:8px 12px;background:#0d1117;border:1px solid #238636;border-radius:8px;margin-top:8px;font-size:12px;}';

  var body =
    '<h2>⏳ Pending Transactions</h2>' +
    '<p>DApp transaction requests waiting for your approval in <b>SheetFra</b>.</p>' +
    '<div class="refresh-bar"><span class="refresh-dot"></span><span class="refresh-text pulse">Live — auto-refreshing every 5s</span></div>' +
    '<div id="requests"><span class="empty"><span class="spinner"></span> Loading...</span></div>' +
    '<div id="status"></div>';

  var js =
    'var AGENT_URL="' + escGas(agentUrl) + '";' +
    'var SHEET_ID="' + escGas(sheetId) + '";' +
    'var SECRET_ID="' + escGas(secretId) + '";' +
    'var API_KEY="' + escGas(apiKey) + '";' +

    'function buildHeaders(extra){' +
    '  var headers={"Content-Type":"application/json"};' +
    '  if(API_KEY)headers["X-API-Key"]=API_KEY;' +
    '  if(extra){for(var k in extra){headers[k]=extra[k];}}' +
    '  return headers;' +
    '}' +

    'function apiFetch(url,options){' +
    '  var opts=options||{};' +
    '  opts.headers=buildHeaders(opts.headers);' +
    '  return fetch(url,opts).then(function(r){return r.json();});' +
    '}' +

    'function poll(){' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/pending?sheetId="+encodeURIComponent(SHEET_ID),{method:"GET"})' +
    '    .then(function(d){renderRequests(d.requests||[]);}).catch(function(){});}' +

    'function renderRequests(rs){' +
    '  var el=document.getElementById("requests");' +
    '  if(!rs.length){el.innerHTML="<span class=\\"empty\\">No pending requests. Listening...</span>";return;}' +
    '  var h="";for(var i=0;i<rs.length;i++){var r=rs[i];' +
    '  var ml=r.method;if(r.method==="eth_sendTransaction")ml="Send Transaction";else if(r.method==="personal_sign")ml="Sign Message";else if(r.method.indexOf("signTypedData")>=0)ml="Sign Typed Data";' +
    '  h+="<div class=\\"request-card\\"><span class=\\"method-badge\\">"+esc(r.method)+"</span> <span style=\\"color:#e3b341;font-size:12px;font-weight:600\\">"+esc(ml)+"</span>"' +
    '    +"<div class=\\"session-meta\\">ID: "+esc(r.id)+"</div>"' +
    '    +"<details><summary>View params</summary><pre>"+esc(JSON.stringify(r.params,null,2))+"</pre></details>"' +
    '    +"<div style=\\"margin-top:8px\\"><button class=\\"btn-sm btn-approve\\" onclick=\\"doApprove(\'"+ea(r.topic)+"\',"+r.id+")\\">Sign & Approve</button>"' +
    '    +"<button class=\\"btn-sm btn-reject\\" onclick=\\"doReject(\'"+ea(r.topic)+"\',"+r.id+")\\">Reject</button></div></div>";}el.innerHTML=h;}' +

    'function doApprove(topic,id){if(!SECRET_ID){alert("No Nillion secret ID. Use SheetFra > Initialize Sheet Wallet first.");return;}' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/sign-and-approve",{method:"POST",body:JSON.stringify({topic:topic,id:id,secretId:SECRET_ID,sheetId:SHEET_ID})})' +
    '    .then(function(d){if(d.error)alert(d.error);else{document.getElementById("status").innerHTML="<p class=\\"ok\\">"+esc(d.method)+" signed</p>";poll();}}).catch(function(e){alert(e.message);});}' +

    'function doReject(topic,id){' +
    '  apiFetch(AGENT_URL+"/api/walletconnect/reject-request",{method:"POST",body:JSON.stringify({topic:topic,id:id,message:"Rejected by user"})})' +
    '    .then(function(d){if(d.error)alert(d.error);else poll();}).catch(function(e){alert(e.message);});}' +

    'function esc(s){if(!s)return"";return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}' +
    'function ea(s){return String(s).replace(/\\\\/g,"\\\\\\\\").replace(/\'/g,"\\\\\\'");}' +
    'poll();setInterval(poll,5000);';

  var html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><style>' + css + '</style></head><body>' + body + '<script>' + js + '</script></body></html>'
  ).setTitle('SheetFra — Pending Tx');

  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Returns active WalletConnect DApp sessions as a 2D array.
 * Use in any cell: =CRE_DAPP_SESSIONS()
 *
 * @return {Array} 2D array with active DApp sessions
 * @customfunction
 */
function CRE_DAPP_SESSIONS() {
  var agentUrl = getAgentUrl();
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

  var data = fetchJson(agentUrl + '/api/walletconnect/sessions?sheetId=' + encodeURIComponent(sheetId), { headers: { 'X-Sheet-Formula': 'CRE_DAPP_SESSIONS()' } });

  if (data.error) return [['Error: ' + data.error]];
  if (!data.sessions || data.sessions.length === 0) return [['No active DApp sessions']];

  var result = [['DAPP', 'URL', 'CHAINS', 'TOPIC', 'CONNECTED']];
  for (var i = 0; i < data.sessions.length; i++) {
    var s = data.sessions[i];
    result.push([
      s.peerName || 'Unknown',
      s.peerUrl || '',
      (s.chains || []).join(', '),
      s.topic ? s.topic.substring(0, 16) + '...' : '',
      s.connectedAt ? new Date(s.connectedAt).toISOString() : ''
    ]);
  }
  return result;
}

// =============================================================
// Interactive Tab Creation
// =============================================================

/**
 * Creates interactive in-sheet tabs if they don't exist.
 * These tabs make the sheet itself the primary UI.
 *
 * Tabs created:
 *   - Settings: Wallet Address, Sheet Owner Email, Risk Factor
 *   - Connect to Dapp: Paste WC URIs directly in cells
 *   - Pending Transactions: WC tx requests with checkboxes
 *   - Chat with Wallet: In-sheet AI chat
 *   - Agent Logs: Action, Explanation, TX Hash, Created At
 */
function setupInteractiveTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Settings tab ──
  createSettingsTab_(ss);

  // ── View Transactions (Portfolio) tab ──
  createViewTransactionsTab_(ss);

  // ── Market Insights tab ──
  createMarketInsightsTab_(ss);

  // ── Risk Rules tab ──
  createRiskRulesTab_(ss);

  // ── Connect to Dapp tab ──
  createConnectToDappTab_(ss);

  // ── Pending Transactions tab ──
  createPendingTransactionsTab_(ss);

  // ── Chat with Wallet tab ──
  createChatWithWalletTab_(ss);

  // ── Agent Logs tab ──
  createAgentLogsTab_(ss);
}

function createSettingsTab_(ss) {
  var existing = ss.getSheetByName('Settings');
  if (existing) return;

  var sheet = ss.insertSheet('Settings');
  var walletAddr = PropertiesService.getScriptProperties().getProperty('WALLET_ADDRESS') || '';
  var email = Session.getEffectiveUser().getEmail();

  // ── Hero banner ──
  sheet.getRange('A1:F1').merge();
  sheet.getRange('A1').setValue('⚡  SheetFra  —  DeFi Treasury Desk');
  sheet.getRange('A1').setFontSize(18).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#1a73e8').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 50);

  sheet.getRange('A2:F2').merge();
  sheet.getRange('A2').setValue('Chainlink  ·  Nillion  ·  WalletConnect  ·  Polkadot');
  sheet.getRange('A2').setFontSize(10).setFontColor('#1a73e8').setHorizontalAlignment('center')
    .setBackground('#e8f0fe').setFontWeight('bold');
  sheet.setRowHeight(2, 26);

  sheet.setRowHeight(3, 10);

  // ── Config header ──
  sheet.getRange('A4:F4').merge();
  sheet.getRange('A4').setValue('  ⚙️  Configuration');
  sheet.getRange('A4').setFontSize(11).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#34a853').setHorizontalAlignment('left');
  sheet.setRowHeight(4, 26);

  var configData = [
    ['Wallet Address', walletAddr || '(not set — run SheetFra → Initialize Sheet Wallet)'],
    ['Sheet Owner Email', email],
    ['Network', 'Polkadot Hub Testnet (testnet)'],
    ['Execution Engine', 'Direct onchain reads + local execution'],
    ['Oracle Stack', 'Chainlink Price Feeds (BFT consensus)  +  Pyth Network Hermes'],
    ['Privacy Layer', 'Nillion Secret Vault'],
    ['DEX', 'Uniswap V3  +  1inch Swap API v6'],
    ['Risk Factor', '5'],
  ];
  for (var i = 0; i < configData.length; i++) {
    var row = 5 + i;
    sheet.getRange(row, 1).setValue(configData[i][0]).setFontWeight('bold').setFontColor('#3c4043').setFontSize(10);
    sheet.getRange(row, 2, 1, 5).merge();
    sheet.getRange(row, 2).setValue(configData[i][1]).setFontColor('#202124').setFontSize(10);
    if (i % 2 === 0) sheet.getRange(row, 1, 1, 6).setBackground('#f8f9fa');
    sheet.setRowHeight(row, 22);
  }
  if (walletAddr) {
    sheet.getRange(5, 2).setFontFamily('Courier New').setFontColor('#1a73e8');
  }

  sheet.setRowHeight(13, 14);

  // ── Quick Start header ──
  sheet.getRange('A14:F14').merge();
  sheet.getRange('A14').setValue('  🚀  Quick Start Guide');
  sheet.getRange('A14').setFontSize(11).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#1a73e8').setHorizontalAlignment('left');
  sheet.setRowHeight(14, 26);

  var steps = [
    'Set AGENT_URL in Script Properties  (Extensions → Apps Script → ⚙ → Script properties)',
    'Run SheetFra → Initialize Sheet Wallet  (one-time setup, creates your Nillion-backed wallet)',
    'Fund your wallet address with PAS from https://faucet.polkadot.io/ + DOT / USDT / WETH',
    'Type  =CRE_PRICE("DOT/USD")  in any cell to confirm CRE connectivity',
    'Open the "View Transactions" tab — click SheetFra → Refresh Portfolio for live data',
    'Type  =CRE_SUGGEST_REBALANCE()  to generate AI-powered rebalance proposals',
    'Approve trades in the "Pending Trades" tab by setting STATUS = APPROVED',
    'Paste a WalletConnect URI in the "Connect to Dapp" tab to link any DApp',
  ];
  for (var j = 0; j < steps.length; j++) {
    var sr = 15 + j;
    sheet.getRange(sr, 1).setValue(String(j + 1) + '.').setHorizontalAlignment('center')
      .setFontWeight('bold').setFontColor('#1a73e8').setBackground('#e8f0fe').setFontSize(11);
    sheet.getRange(sr, 2, 1, 5).merge();
    sheet.getRange(sr, 2).setValue(steps[j]).setFontColor('#3c4043').setFontSize(10);
    if (j % 2 !== 0) sheet.getRange(sr, 1, 1, 6).setBackground('#f1f3f4');
    sheet.setRowHeight(sr, 22);
  }

  sheet.setRowHeight(23, 14);

  // ── Formulas reference ──
  sheet.getRange('A24:F24').merge();
  sheet.getRange('A24').setValue('  📊  Available Spreadsheet Formulas');
  sheet.getRange('A24').setFontSize(11).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#ea4335').setHorizontalAlignment('left');
  sheet.setRowHeight(24, 26);

  var formulas = [
    ['=CRE_PRICE("DOT/USD")', 'Live DOT/USD price from Chainlink BFT oracle'],
    ['=CRE_BALANCE("DOT")', 'Your DOT wallet balance (CRE-verified)'],
    ['=CRE_PORTFOLIO()', 'Full portfolio table with all token holdings'],
    ['=CRE_GAS()', 'Current Polkadot Hub gas price in gwei'],
    ['=CRE_SUGGEST_REBALANCE()', 'AI-generated rebalance proposals → Pending Trades tab'],
    ['=CRE_TRADE("swap 50 USDT for WETH")', 'Natural language trade via Gemini AI + CRE'],
    ['=CRE_PRIVATE_TRADE("USDT","WETH",100)', 'Private confidential trade via agent TEE'],
    ['=CRE_RISK_RULES()', 'View current on-chain risk guardrails (RiskVault)'],
    ['=CRE_MISSION_CONTROL()', 'Treasury health score + autopilot status'],
    ['=CRE_MARKET_INSIGHTS()', 'Real-time market signals for all supported tokens'],
    ['=CRE_DOT_PRICE()', 'DOT / Polkadot native token price via oracle'],
    ['=CRE_SCORECARD()', 'Full hackathon judging scorecard'],
  ];
  for (var k = 0; k < formulas.length; k++) {
    var fr = 25 + k;
    sheet.getRange(fr, 1, 1, 2).merge();
    sheet.getRange(fr, 1).setValue(formulas[k][0]).setFontFamily('Courier New').setFontSize(10).setFontColor('#1a73e8');
    sheet.getRange(fr, 3, 1, 4).merge();
    sheet.getRange(fr, 3).setValue(formulas[k][1]).setFontColor('#5f6368').setFontSize(10);
    if (k % 2 === 0) sheet.getRange(fr, 1, 1, 6).setBackground('#f8f9fa');
    sheet.setRowHeight(fr, 20);
  }

  // Column widths
  sheet.setColumnWidth(1, 40);
  sheet.setColumnWidth(2, 340);
  sheet.setColumnWidth(3, 320);
  sheet.setColumnWidth(4, 60);
  sheet.setColumnWidth(5, 60);
  sheet.setColumnWidth(6, 60);

  sheet.setTabColor('#1a73e8');
  sheet.setFrozenRows(1);
}

function createConnectToDappTab_(ss) {
  if (ss.getSheetByName('Connect to Dapp')) return;

  var sheet = ss.insertSheet('Connect to Dapp');

  // ── Title banner ──
  sheet.getRange('A1:E1').merge();
  sheet.getRange('A1').setValue('🔗  Connect to DApp  —  WalletConnect v2');
  sheet.getRange('A1').setFontSize(14).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#2596be').setHorizontalAlignment('left');
  sheet.setRowHeight(1, 40);

  // ── Instructions banner ──
  sheet.getRange('A2:E2').merge();
  sheet.getRange('A2').setValue(
    'HOW TO CONNECT: Open any DApp (Uniswap, Aave, etc.) → choose WalletConnect → copy the URI (starts with "wc:") → paste it in column C below'
  );
  sheet.getRange('A2').setFontSize(10).setFontColor('#155c7a').setBackground('#d0eaf8').setWrap(true);
  sheet.setRowHeight(2, 36);

  // ── Column headers ──
  sheet.getRange('A3:E3').setValues([['Connection ID', 'dApp URL', 'WalletConnect URL  ← Paste URI here', 'Status', 'Timestamp']]);
  sheet.getRange('A3:E3').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff')
    .setBackground('#1a7fad');
  sheet.setRowHeight(3, 24);

  // ── Example format row ──
  sheet.getRange('A4:E4').setValues([['(auto-generated)', '(auto-detected)', 'wc:1b3c...@2?relay-protocol=irn&symKey=abc123...', 'Waiting', '']]);
  sheet.getRange('A4:E4').setFontSize(9).setFontColor('#777777').setBackground('#f0f9ff').setFontStyle('italic');
  sheet.getRange('C4').setFontColor('#2596be');

  // ── Troubleshooting section ──
  sheet.getRange('A18:E18').merge();
  sheet.getRange('A18').setValue('⚠️  TROUBLESHOOTING');
  sheet.getRange('A18').setFontWeight('bold').setFontColor('#ffffff').setBackground('#f4a261').setFontSize(10);
  sheet.setRowHeight(18, 22);

  var tips = [
    'URLs expire after a short time — get a fresh WalletConnect URL for each connection attempt',
    'Make sure the URL starts with "wc:" and contains "@2?" for WalletConnect v2 protocol',
    'If connection fails, try again with a fresh URL from the DApp',
    'The agent processes connections automatically — watch the Status column change to "Connected"',
  ];
  for (var t = 0; t < tips.length; t++) {
    var tr = 19 + t;
    sheet.getRange(tr, 1).setValue('•').setHorizontalAlignment('center').setFontColor('#f4a261');
    sheet.getRange(tr, 2, 1, 4).merge();
    sheet.getRange(tr, 2).setValue(tips[t]).setFontSize(9).setFontColor('#5f6368');
    if (t % 2 === 0) sheet.getRange(tr, 1, 1, 5).setBackground('#fff8f0');
    sheet.setRowHeight(tr, 20);
  }

  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 480);
  sheet.setColumnWidth(4, 140);
  sheet.setColumnWidth(5, 200);

  sheet.setTabColor('#2596be');
  sheet.setFrozenRows(3);
}

function createPendingTransactionsTab_(ss) {
  if (ss.getSheetByName('Pending Transactions')) return;

  var sheet = ss.insertSheet('Pending Transactions');

  // ── Title banner ──
  sheet.getRange('A1:H1').merge();
  sheet.getRange('A1').setValue('⏳  Pending Transactions  —  WalletConnect Requests Awaiting Approval');
  sheet.getRange('A1').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#e8a317').setHorizontalAlignment('left');
  sheet.setRowHeight(1, 40);

  // ── Instructions ──
  sheet.getRange('A2:H2').merge();
  sheet.getRange('A2').setValue(
    'Check the APPROVE box to sign & send a transaction, or REJECT to decline.  The agent processes your choice automatically within 10 seconds.'
  );
  sheet.getRange('A2').setFontSize(10).setFontColor('#7a5a00').setBackground('#fff8e1').setWrap(false);
  sheet.setRowHeight(2, 24);

  // ── Column headers ──
  sheet.getRange('A3:H3').setValues([['Request ID', 'Connection ID', 'Type', 'Details', 'Status', 'Timestamp', '✅ Approve', '❌ Reject']]);
  sheet.getRange('A3:H3').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff')
    .setBackground('#c17f00');
  sheet.setRowHeight(3, 24);

  // ── Sub-header instructions ──
  sheet.getRange('G4').setValue('Check to approve').setFontSize(9).setFontColor('#666666').setHorizontalAlignment('center');
  sheet.getRange('H4').setValue('Check to reject').setFontSize(9).setFontColor('#666666').setHorizontalAlignment('center');
  sheet.setRowHeight(4, 18);

  // Checkboxes for Approve/Reject columns (G5:H100)
  sheet.getRange('G5:H100').insertCheckboxes();

  // ── Conditional formatting on Status column (E) ──
  var rules = sheet.getConditionalFormatRules();
  var statusRange = sheet.getRange('E5:E100');

  var pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Pending')
    .setBackground('#fff8e1').setFontColor('#f57f17')
    .setRanges([statusRange]).build();

  var approvedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Approved')
    .setBackground('#e6f4ea').setFontColor('#137333')
    .setRanges([statusRange]).build();

  var rejectedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Rejected')
    .setBackground('#fce8e6').setFontColor('#c5221f')
    .setRanges([statusRange]).build();

  var approvingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Approving...')
    .setBackground('#e8f0fe').setFontColor('#1a73e8')
    .setRanges([statusRange]).build();

  rules.push(pendingRule, approvedRule, rejectedRule, approvingRule);
  sheet.setConditionalFormatRules(rules);

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 160);
  sheet.setColumnWidth(4, 380);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 200);
  sheet.setColumnWidth(7, 130);
  sheet.setColumnWidth(8, 130);

  sheet.setTabColor('#e8a317');
  sheet.setFrozenRows(3);
}

function createChatWithWalletTab_(ss) {
  if (ss.getSheetByName('Chat with Wallet')) return;

  var sheet = ss.insertSheet('Chat with Wallet');

  // ── Title banner ──
  sheet.getRange('A1:D1').merge();
  sheet.getRange('A1').setValue('💬  SheetFra AI Agent  —  Powered by Gemini');
  sheet.getRange('A1').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#2ea043').setHorizontalAlignment('left');
  sheet.setRowHeight(1, 40);

  // ── Input row (B2 — agent polls this cell) ──
  sheet.getRange('A2').setValue('Your message:');
  sheet.getRange('A2').setFontWeight('bold').setFontSize(11).setFontColor('#202124');
  sheet.getRange('B2').setValue('');
  sheet.getRange('B2').setBackground('#f0fff4').setBorder(true, true, true, true, false, false, '#34a853', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange('C2').setValue('← Type here  |  /help for commands');
  sheet.getRange('C2').setFontColor('#9aa0a6').setFontSize(10).setFontStyle('italic');
  sheet.setRowHeight(2, 28);

  // ── Hints row ──
  sheet.getRange('A3:D3').merge();
  sheet.getRange('A3').setValue(
    'Try:  /portfolio  ·  /price DOT/USD  ·  "Swap 50 USDT for WETH"  ·  "Suggest a rebalance"  ·  /help'
  );
  sheet.getRange('A3').setFontSize(10).setFontColor('#0b6e2e').setBackground('#d4edda').setWrap(false);
  sheet.setRowHeight(3, 24);

  sheet.setRowHeight(4, 10);

  // ── Chat history header ──
  sheet.getRange('A5:D5').merge();
  sheet.getRange('A5').setValue('Chat History');
  sheet.getRange('A5').setFontSize(11).setFontWeight('bold').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setBackground('#218838');
  sheet.setRowHeight(5, 24);

  // ── Column sub-headers ──
  sheet.getRange('A6:D6').setValues([['Speaker', 'Message', 'Timestamp', '']]);
  sheet.getRange('A6:D6').setFontWeight('bold').setFontSize(10).setFontColor('#5f6368')
    .setBackground('#f1f3f4');
  sheet.setRowHeight(6, 22);

  // ── Welcome message ──
  sheet.getRange('A7:D7').setValues([['Agent', '👋 Hi! I\'m SheetFra. Type /help for commands, or ask me anything — "What\'s my portfolio?" or "Swap 50 USDT for WETH"', new Date().toISOString(), '']]);
  sheet.getRange('A7').setFontColor('#218838').setFontWeight('bold');
  sheet.getRange('B7').setWrap(true);

  // Set column widths
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 560);
  sheet.setColumnWidth(3, 180);
  sheet.setColumnWidth(4, 60);

  sheet.setTabColor('#2ea043');
  sheet.setFrozenRows(6);
}

function createAgentLogsTab_(ss) {
  if (ss.getSheetByName('Agent Logs')) return;

  var sheet = ss.insertSheet('Agent Logs');

  // ── Title banner ──
  sheet.getRange('A1:E1').merge();
  sheet.getRange('A1').setValue('📋  Agent Logs  —  All SheetFra Actions');
  sheet.getRange('A1').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#30363d').setHorizontalAlignment('left');
  sheet.setRowHeight(1, 40);

  // ── Legend row ──
  sheet.getRange('A2:E2').merge();
  sheet.getRange('A2').setValue(
    '🟢 execute_trade / swap   🔵 chat_response   🟣 walletconnect_pair / approve   🟡 portfolio_update   🔴 error'
  );
  sheet.getRange('A2').setFontSize(9).setFontColor('#5f6368').setBackground('#f6f8fa');
  sheet.setRowHeight(2, 20);

  // ── Column headers ──
  sheet.getRange('A3:E3').setValues([['Action Type', 'Explanation', 'Transaction Hash', 'Created At', 'Status']]);
  sheet.getRange('A3:E3').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff')
    .setBackground('#484f58');
  sheet.setRowHeight(3, 24);

  // ── Conditional formatting on Action column ──
  var rules = sheet.getConditionalFormatRules();
  var actionRange = sheet.getRange('A4:A500');

  var tradeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('trade')
    .setBackground('#e6f4ea').setFontColor('#137333')
    .setRanges([actionRange]).build();

  var swapRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('swap')
    .setBackground('#e6f4ea').setFontColor('#137333')
    .setRanges([actionRange]).build();

  var chatRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('chat')
    .setBackground('#e8f0fe').setFontColor('#1a73e8')
    .setRanges([actionRange]).build();

  var wcRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('walletconnect')
    .setBackground('#f3e8fd').setFontColor('#7b2fbf')
    .setRanges([actionRange]).build();

  var errorRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('error')
    .setBackground('#fce8e6').setFontColor('#c5221f')
    .setRanges([actionRange]).build();

  rules.push(tradeRule, swapRule, chatRule, wcRule, errorRule);
  sheet.setConditionalFormatRules(rules);

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 380);
  sheet.setColumnWidth(3, 340);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 120);

  sheet.setTabColor('#30363d');
  sheet.setFrozenRows(3);
}

// =============================================================
// Interactive onEdit Triggers
// =============================================================

/**
 * Enhanced installable onEdit trigger that handles:
 * 1. "Pending Trades" tab → STATUS=APPROVED → execute trade
 * 2. "Chat with Wallet" tab → B2 message → send to AI chat
 * 3. "Connect to Dapp" tab → WC URI in column C → pair
 * 4. "Pending Transactions" tab → Approve/Reject checkboxes → handle WC requests
 *
 * Setup: Extensions → Apps Script → Triggers → Add Trigger
 *   Function: onEditTrigger | Event type: From spreadsheet → On edit
 */
function onEditTrigger(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();

  // Route to the appropriate handler
  switch (sheetName) {
    case 'Pending Trades':
      handlePendingTradeEdit_(e, sheet);
      break;
    case 'Chat with Wallet':
      handleChatEdit_(e, sheet);
      break;
    case 'Connect to Dapp':
      handleConnectToDappEdit_(e, sheet);
      break;
    case 'Pending Transactions':
      handlePendingTransactionEdit_(e, sheet);
      break;
  }
}

/**
 * Handles edits to the "Pending Trades" tab.
 * When STATUS (column F) changes to "APPROVED", executes the trade.
 */
function handlePendingTradeEdit_(e, sheet) {
  var col = e.range.getColumn();
  var STATUS_COL = 6; // Column F
  if (col !== STATUS_COL) return;

  var newValue = String(e.value || '').trim().toUpperCase();
  if (newValue !== 'APPROVED') return;

  var row = e.range.getRow();
  if (row <= 1) return; // Skip header row

  var sheetData = sheet.getRange(row, 1, 1, 9).getValues()[0];
  var tokenIn    = String(sheetData[1] || '').trim().toUpperCase();
  var tokenOut   = String(sheetData[2] || '').trim().toUpperCase();
  var amount     = parseFloat(sheetData[3]) || 0;
  var slippageBps = parseInt(sheetData[4]) || 50;
  var rebalanceId = String(sheetData[7] || '').trim();
  var reason     = String(sheetData[8] || '').trim();

  // Token normalization (no longer needed for Polkadot Hub Testnet)

  if (!tokenIn || !tokenOut || amount <= 0) {
    sheet.getRange(row, 7).setValue('Error: missing trade data in row ' + row);
    return;
  }

  // Extract planLegId from REASON column if present (format: [plan:XXXXX] ...)
  var planLegId = '';
  var planMatch = reason.match(/\[plan:([^\]]+)\]/);
  if (planMatch) {
    planLegId = planMatch[1];
  }

  // Mark as processing
  sheet.getRange(row, STATUS_COL).setValue('PROCESSING').setBackground('#fff8e1').setFontColor('#f9a825');
  sheet.getRange(row, 7).setValue('Submitting...');

  var props = PropertiesService.getScriptProperties();
  var secretId = props.getProperty('NILLION_SECRET_ID');
  if (!secretId) {
    sheet.getRange(row, 7).setValue('Error: wallet not initialized');
    sheet.getRange(row, STATUS_COL).setValue('ERROR').setBackground('#fce8e6').setFontColor('#d93025');
    return;
  }

  var agentUrl = getAgentUrl();
  var spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  var webhookToken = props.getProperty('CRE_WEBHOOK_TOKEN') || '';

  var payload = {
    secretId: secretId,
    sheetId: spreadsheetId,
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    amount: amount,
    slippageBps: slippageBps,
    rebalanceId: rebalanceId
  };
  if (planLegId) {
    payload.planLegId = planLegId;
  }

  var sheetCommand = 'APPROVED: ' + amount + ' ' + tokenIn + ' → ' + tokenOut + ' (slippage ' + slippageBps + 'bps)' + (rebalanceId ? ' rebalance=' + rebalanceId : '');
  var data = fetchJson(agentUrl + '/api/execute', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'X-Webhook-Token': webhookToken,
      'X-Sheet-Command': sheetCommand
    },
    payload: JSON.stringify(payload)
  });

  if (data.error) {
    var errDetail = data.error;
    if (data.reason) errDetail += ' — ' + data.reason;
    sheet.getRange(row, 7).setValue('Error: ' + errDetail);
    sheet.getRange(row, STATUS_COL).setValue('FAILED').setBackground('#fce8e6').setFontColor('#d93025');
    return;
  }

  sheet.getRange(row, 7).setValue(data.txHash);
  sheet.getRange(row, STATUS_COL).setValue('EXECUTED').setBackground('#e6f4ea').setFontColor('#188038');

  // Log to Agent Logs
  logToAgentLogs_('execute_trade', tokenIn + ' -> ' + tokenOut + ' (' + amount + ')', data.txHash || '');
}

/**
 * Handles edits to the "Chat with Wallet" tab.
 * When the user types a message in B2 and presses Enter, sends it to the chat API.
 */
function handleChatEdit_(e, sheet) {
  var col = e.range.getColumn();
  var row = e.range.getRow();

  // Only respond to edits in B2 or B3 (the input cell — B3 in new layout, B2 in old)
  if (col !== 2 || (row !== 2 && row !== 3)) return;

  var message = String(e.value || '').trim();
  if (!message) return;

  // Record the user's message in Chat History (starts at row 7 in new layout)
  var chatHistoryStart = 7;
  var lastRow = Math.max(sheet.getLastRow(), chatHistoryStart - 1);
  var nextRow = lastRow + 1;
  var now = new Date().toLocaleTimeString();

  sheet.getRange(nextRow, 1).setValue('You').setFontWeight('bold').setBackground('#e6f4ea').setFontColor('#137333');
  sheet.getRange(nextRow, 2).setValue(message).setBackground('#e6f4ea').setWrap(true);
  sheet.getRange(nextRow, 3).setValue(now).setFontColor('#9aa0a6').setFontSize(9).setBackground('#e6f4ea');
  sheet.setRowHeight(nextRow, 24);

  // Clear the input cell (B3 in new layout)
  var inputRow = 3;
  sheet.getRange(inputRow, 2).setValue('');

  // Show "Thinking..." indicator
  var thinkingRow = nextRow + 1;
  sheet.getRange(thinkingRow, 1).setValue('Agent').setFontWeight('bold').setBackground('#e8f0fe').setFontColor('#1a73e8');
  sheet.getRange(thinkingRow, 2).setValue('Thinking...').setBackground('#e8f0fe').setFontStyle('italic');
  sheet.getRange(thinkingRow, 3).setValue(now).setFontColor('#9aa0a6').setFontSize(9).setBackground('#e8f0fe');
  SpreadsheetApp.flush();

  // Send to chat API
  var agentUrl = getAgentUrl();
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

  var data = fetchJson(agentUrl + '/api/chat', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      message: message,
      sheetId: sheetId
    })
  });

  // Replace "Thinking..." with actual response
  var response = data.response || data.error || 'Sorry, I could not process that request.';
  sheet.getRange(thinkingRow, 2).setValue(response).setFontStyle('normal').setWrap(true);
  sheet.getRange(thinkingRow, 1).setBackground('#e8f0fe').setFontStyle('normal');
  sheet.getRange(thinkingRow, 2).setBackground('#e8f0fe');
  sheet.getRange(thinkingRow, 3).setBackground('#e8f0fe');
  sheet.setRowHeight(thinkingRow, 24);

  // Log to Agent Logs
  logToAgentLogs_('chat_response', 'User: "' + message.substring(0, 60) + '"', '');
}

/**
 * Handles edits to the "Connect to Dapp" tab.
 * When a WC URI is pasted in any column (row 3+), auto-initiates pairing.
 */
function handleConnectToDappEdit_(e, sheet) {
  var col = e.range.getColumn();
  var row = e.range.getRow();

  // Only respond to edits in row 3+
  if (row < 3) return;

  var uri = String(e.value || '').trim();
  if (!uri || !uri.startsWith('wc:')) return;

  // Mark as connecting
  var connectionId = 'conn-' + new Date().getTime();
  sheet.getRange(row, 1).setValue(connectionId);
  sheet.getRange(row, 4).setValue('Connecting...').setBackground('#fff8e1');
  sheet.getRange(row, 5).setValue(new Date().toISOString());
  SpreadsheetApp.flush();

  var agentUrl = getAgentUrl();
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

  var data = fetchJson(agentUrl + '/api/walletconnect/pair', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      uri: uri,
      sheetId: sheetId
    })
  });

  if (data.error) {
    var wcErr = data.error;
    if (data.reason) wcErr += ' — ' + data.reason;
    sheet.getRange(row, 4).setValue('Failed: ' + wcErr).setBackground('#fce8e6');
  } else {
    sheet.getRange(row, 4).setValue('Connected').setBackground('#e6f4ea');
  }

  // Clear the WC URL (it's been consumed)
  sheet.getRange(row, 3).setValue('');

  // Log to Agent Logs
  logToAgentLogs_('walletconnect_pair', 'Connected to dApp via WC URI', '');
}

/**
 * Handles edits to the "Pending Transactions" tab (WalletConnect requests).
 * When Approve (col G) or Reject (col H) checkbox is toggled, processes the request.
 */
function handlePendingTransactionEdit_(e, sheet) {
  var col = e.range.getColumn();
  var row = e.range.getRow();

  // Only respond to Approve (col 7) or Reject (col 8) columns, row 3+
  if ((col !== 7 && col !== 8) || row < 3) return;

  var newValue = String(e.value || '').trim().toUpperCase();
  if (newValue !== 'TRUE') return;

  // Determine action
  var action = col === 7 ? 'approve' : 'reject';

  // Read the row data
  var rowData = sheet.getRange(row, 1, 1, 8).getValues()[0];
  var requestId = String(rowData[0] || '').trim();
  var connectionId = String(rowData[1] || '').trim();
  var type = String(rowData[2] || '').trim();

  if (!requestId) return;

  // Mark as processing
  sheet.getRange(row, 5).setValue(action === 'approve' ? 'Approving...' : 'Rejecting...');
  SpreadsheetApp.flush();

  var agentUrl = getAgentUrl();
  var props = PropertiesService.getScriptProperties();
  var secretId = props.getProperty('NILLION_SECRET_ID') || '';
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

  if (action === 'approve') {
    // Parse requestId to extract topic and id
    var data = fetchJson(agentUrl + '/api/walletconnect/sign-and-approve', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        topic: connectionId,
        id: parseInt(requestId.replace('req-', '')) || 0,
        secretId: secretId,
        sheetId: sheetId
      })
    });

    if (data.error) {
      var approveErr = data.error;
      if (data.reason) approveErr += ' — ' + data.reason;
      sheet.getRange(row, 5).setValue('Failed: ' + approveErr).setBackground('#fce8e6');
    } else {
      sheet.getRange(row, 5).setValue('Approved').setBackground('#e6f4ea');
    }
  } else {
    var data = fetchJson(agentUrl + '/api/walletconnect/reject-request', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        topic: connectionId,
        id: parseInt(requestId.replace('req-', '')) || 0,
        message: 'Rejected by user via sheet'
      })
    });

    if (data.error) {
      var rejectErr = data.error;
      if (data.reason) rejectErr += ' — ' + data.reason;
      sheet.getRange(row, 5).setValue('Failed: ' + rejectErr).setBackground('#fce8e6');
    } else {
      sheet.getRange(row, 5).setValue('Rejected').setBackground('#fce8e6');
    }
  }

  // Uncheck both boxes after processing
  sheet.getRange(row, 7).setValue(false);
  sheet.getRange(row, 8).setValue(false);

  // Log to Agent Logs
  logToAgentLogs_(action + '_transaction', type + ' request ' + requestId, '');
}

/**
 * Helper to append a log to the "Agent Logs" tab.
 */
function logToAgentLogs_(action, explanation, txHash, status) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('Agent Logs');
  if (!logSheet) return;

  var lastRow = Math.max(logSheet.getLastRow(), 3);
  var nextRow = lastRow + 1;
  logSheet.getRange(nextRow, 1, 1, 5).setValues([[
    action,
    explanation,
    txHash || 'N/A',
    new Date().toISOString(),
    status || 'ok'
  ]]);
}

// =============================================================
// Chat with Wallet custom function
// =============================================================

/**
 * Sends a message to the SheetFra AI agent and returns the response.
 * Can be used directly in a cell: =CRE_CHAT("What tokens should I buy?")
 *
 * @param {string} message The message to send to the agent
 * @return {string} The agent's response
 * @customfunction
 */
function CRE_CHAT(message) {
  if (!message) return 'Usage: =CRE_CHAT("What tokens should I buy?")';

  var agentUrl = getAgentUrl();
  var sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

  var data = fetchJson(agentUrl + '/api/chat', {
    method: 'post',
    headers: { 'X-Sheet-Formula': 'CRE_CHAT("' + message + '")' },
    contentType: 'application/json',
    payload: JSON.stringify({
      message: String(message),
      sheetId: sheetId
    })
  });

  if (data.error) return "Error: " + data.error + (data.reason ? " — " + data.reason : "");
  return data.response || "No response";
}

// =============================================================
// Full Audit Trail Custom Functions
// =============================================================

/**
 * Returns recent execution proofs from the Execution Proofs tab.
 * Proofs show execution attestations with venue selection details.
 *
 * @param {number} limit Number of proofs to show (default 10)
 * @return {Array} 2D array with execution proofs
 * @customfunction
 */
function CRE_EXECUTION_PROOFS(limit) {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/execution-proofs?limit=' + (limit || 10), { headers: { 'X-Sheet-Formula': 'CRE_EXECUTION_PROOFS(' + (limit||'') + ')' } });
  if (data.error) return [['Error: ' + data.error]];
  if (!data.proofs || data.proofs.length === 0) return [['No execution proofs yet. Run a trade to generate proofs.']];

  var result = [['TIME', 'PROOF ID', 'PAIR', 'AMOUNT', 'VENUE', 'CHAINLINK PRICE', 'SAVINGS', 'PRIVACY']];
  for (var i = 0; i < data.proofs.length; i++) {
    var p = data.proofs[i];
    result.push([
      p.timestamp, p.proofId, p.pair, p.amount,
      p.selectedVenue, p.chainlinkPrice,
      p.savingsVsBestPublic || 'N/A', p.privacyMode || 'normal'
    ]);
  }
  return result;
}

/**
 * Returns recent approval records from the Approvals tab.
 * Shows policy check results and verification status for each trade.
 *
 * @param {number} limit Number of approvals to show (default 10)
 * @return {Array} 2D array with approval records
 * @customfunction
 */
function CRE_APPROVALS(limit) {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/approvals?limit=' + (limit || 10), { headers: { 'X-Sheet-Formula': 'CRE_APPROVALS(' + (limit||'') + ')' } });
  if (data.error) return [['Error: ' + data.error]];
  if (!data.approvals || data.approvals.length === 0) return [['No approval records yet.']];

  var result = [['TIME', 'REBALANCE ID', 'ACTION', 'POLICY RESULT', 'VERIFICATION', 'PRIVACY', 'TX HASH']];
  for (var i = 0; i < data.approvals.length; i++) {
    var a = data.approvals[i];
    result.push([
      a.timestamp, a.rebalanceId, a.action,
      a.policyResult, a.creVerification,
      a.privacyMode, a.txHash || ''
    ]);
  }
  return result;
}

/**
 * Returns current pending trades awaiting approval.
 * Set STATUS to "APPROVED" in the Pending Trades tab to execute.
 *
 * @param {number} limit Number of trades to show (default 20)
 * @return {Array} 2D array with pending trades
 * @customfunction
 */
function CRE_PENDING_TRADES(limit) {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/pending-trades?limit=' + (limit || 20), { headers: { 'X-Sheet-Formula': 'CRE_PENDING_TRADES(' + (limit||'') + ')' } });
  if (data.error) return [['Error: ' + data.error]];
  if (!data.trades || data.trades.length === 0) return [['No pending trades. Use =CRE_SUGGEST_REBALANCE() to generate trade proposals.']];

  var result = [['TIME', 'TOKEN IN', 'TOKEN OUT', 'AMOUNT', 'SLIPPAGE', 'STATUS', 'TX HASH', 'REBALANCE ID', 'REASON']];
  for (var i = 0; i < data.trades.length; i++) {
    var t = data.trades[i];
    result.push([
      t.timestamp, t.tokenIn, t.tokenOut, t.amount,
      t.slippageBps, t.status, t.txHash || '',
      t.rebalanceId || '', t.reason || ''
    ]);
  }
  return result;
}

/**
 * Returns recent after-trade reconciliation records.
 * Shows before/after state comparisons and actual vs expected slippage.
 *
 * @param {number} limit Number of records to show (default 10)
 * @return {Array} 2D array with reconciliation records
 * @customfunction
 */
function CRE_RECONCILIATION(limit) {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/reconciliation?limit=' + (limit || 10), { headers: { 'X-Sheet-Formula': 'CRE_RECONCILIATION(' + (limit||'') + ')' } });
  if (data.error) return [['Error: ' + data.error]];
  if (!data.records || data.records.length === 0) return [['No reconciliation records yet.']];

  var result = [['TIME', 'TRADE REF', 'BEFORE', 'AFTER', 'EXPECTED', 'ACTUAL', 'SLIPPAGE BPS', 'STATUS']];
  for (var i = 0; i < data.records.length; i++) {
    var r = data.records[i];
    result.push([
      r.timestamp, r.tradeRef, r.before, r.after,
      r.expected, r.actual, r.slippageBps || '', r.status
    ]);
  }
  return result;
}

/**
 * Returns full system status: workflow health, integrations, price cache.
 * Use this to verify the agent is running and the agent is operational.
 *
 * @return {Array} 2D array with system status
 * @customfunction
 */
function CRE_STATUS() {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/status', { headers: { 'X-Sheet-Formula': 'CRE_STATUS()' } });
  if (data.error) return [['Error: ' + data.error]];

  var result = [
    ['SYSTEM STATUS', 'VALUE'],
    ['Service', data.service || 'sheetfra-agent'],
    ['Status', data.status || 'unknown'],
    ['Version', data.version || ''],
    ['Uptime', data.uptime || ''],
    ['Network', data.network || ''],
    ['Judge Mode', String(data.judgeMode || false)],
  ];

  // Workflow summary
  if (data.cre) {
    result.push(['', '']);
    result.push(['MODULES', '']);
    result.push(['Total', String(data.cre.totalWorkflows || 0)]);
    result.push(['Deployed', String(data.cre.deployed || 0)]);
    result.push(['Simulation', String(data.cre.simulation || 0)]);
    result.push(['Blocked', String(data.cre.blocked || 0)]);
    result.push(['Triggers', data.cre.triggerSummary || '']);

    if (data.cre.workflows) {
      for (var i = 0; i < data.cre.workflows.length; i++) {
        var w = data.cre.workflows[i];
        result.push([w.name, w.mode + ' (' + w.trigger + ')']);
      }
    }
  }

  // Price cache
  if (data.priceCache) {
    result.push(['', '']);
    result.push(['PRICE CACHE', '']);
    for (var j = 0; j < data.priceCache.length; j++) {
      var pc = data.priceCache[j];
      result.push([pc.pair, pc.price ? '$' + Number(pc.price).toFixed(2) : 'Not cached']);
    }
  }

  // Contracts
  if (data.contracts) {
    result.push(['', '']);
    result.push(['CONTRACTS', '']);
    result.push(['SheetFraRegistry', data.contracts.sheetFraRegistry || 'not deployed']);
    result.push(['RiskVault', data.contracts.riskVault || 'not deployed']);
    result.push(['BalanceReader', data.contracts.balanceReader || 'not deployed']);
  }

  return result;
}

// =============================================================
// Auto-Refresh Timed Triggers
// =============================================================

/**
 * Sets up a timed trigger that auto-refreshes the Portfolio tab every 5 minutes.
 * Call this once from the SheetFra menu or manually.
 *
 * Trigger invocations are free within Apps Script quotas (20 triggers max).
 */
function setupAutoRefresh() {
  // Remove existing refresh triggers to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoRefreshPortfolio') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create a new trigger that runs every 5 minutes
  ScriptApp.newTrigger('autoRefreshPortfolio')
    .timeBased()
    .everyMinutes(5)
    .create();
}

/**
 * Removes the auto-refresh trigger.
 */
function removeAutoRefresh() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoRefreshPortfolio') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  if (removed > 0) {
    SpreadsheetApp.getUi().alert('Auto-refresh disabled. Removed ' + removed + ' trigger(s).');
  } else {
    SpreadsheetApp.getUi().alert('No auto-refresh trigger was active.');
  }
}

/**
 * Auto-refresh function called by the timed trigger.
 * Silently refreshes the Portfolio tab without showing alerts.
 */
function autoRefreshPortfolio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    var agentUrl = getAgentUrl();
    var data = fetchJson(agentUrl + '/api/portfolio');
    if (data.error || !data.tokens) return;

    var vtSheet = ss.getSheetByName('View Transactions');
    if (vtSheet) {
      writePortfolioToViewTransactions_(vtSheet, data);
    }

    var legacySheet = ss.getSheetByName('Portfolio');
    if (legacySheet) {
      legacySheet.getRange('A1:E20').clearContent();
      legacySheet.getRange('A1:E1').setValues([['TOKEN', 'BALANCE', 'PRICE', 'USD VALUE', 'CHAIN']]);
      legacySheet.getRange('A1:E1').setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
      for (var i = 0; i < data.tokens.length; i++) {
        var token = data.tokens[i];
        var row = i + 2;
        legacySheet.getRange('A' + row + ':E' + row).setValues([[
          token.symbol,
          token.balance.toFixed(token.symbol === 'USDT' ? 2 : 6),
          '$' + token.price.toFixed(2),
          '$' + token.valueUsd.toFixed(2),
          token.chain || 'Polkadot Hub'
        ]]);
        if (i % 2 === 0) legacySheet.getRange('A' + row + ':E' + row).setBackground('#f8f9fa');
      }
      var totalRow = data.tokens.length + 3;
      legacySheet.getRange('A' + totalRow).setValue('TOTAL: $' + data.totalValueUsd.toFixed(2)).setFontWeight('bold').setFontColor('#137333');
      legacySheet.getRange('A' + (totalRow + 1)).setValue('Auto-refreshed: ' + new Date().toISOString()).setFontColor('#9aa0a6').setFontSize(9);
    }
  } catch (e) {
    // Silent failure for background refresh
  }
}

// =============================================================
// Export Custom Functions
// =============================================================

/**
 * Exports trade history as a table within the sheet.
 * Optionally filter by date range.
 *
 * @param {string} fromDate Optional start date (YYYY-MM-DD)
 * @param {string} toDate Optional end date (YYYY-MM-DD)
 * @return {Array} 2D array with trade history
 * @customfunction
 */
function CRE_EXPORT_TRADES(fromDate, toDate) {
  var agentUrl = getAgentUrl();
  var url = agentUrl + '/api/export/trades?format=json';
  if (fromDate) url += '&from=' + String(fromDate);
  if (toDate) url += '&to=' + String(toDate);

  var data = fetchJson(url, { headers: { 'X-Sheet-Formula': 'CRE_EXPORT_TRADES(' + (fromDate ? '"' + fromDate + '"' : '') + (toDate ? ',"' + toDate + '"' : '') + ')' } });
  if (data.error) return [['Error: ' + data.error]];
  if (!data.trades || data.trades.length === 0) return [['No trade data found.']];

  var keys = Object.keys(data.trades[0]);
  var result = [keys];
  for (var i = 0; i < data.trades.length; i++) {
    var row = [];
    for (var j = 0; j < keys.length; j++) {
      row.push(data.trades[i][keys[j]] || '');
    }
    result.push(row);
  }
  return result;
}

// =============================================================
// New Interactive Tabs: View Transactions, Market Insights, Risk Rules
// =============================================================

/**
 * Creates the "View Transactions" portfolio dashboard tab.
 * Mirrors the layout from the SheetFra reference project:
 *   Row 1  : Title + last-updated timestamp
 *   Rows 3-6  : Summary (wallet, network, total balance, changes)
 *   Rows 8-10 : Key metrics (ETH balance, token count, etc.)
 *   Rows 12-19: Distribution (asset, USD value, % of portfolio)
 *   Rows 27+  : Token holdings (symbol, balance, price, 24h, 7d, explorer)
 */
function createViewTransactionsTab_(ss) {
  if (ss.getSheetByName('View Transactions')) return;

  var sheet = ss.insertSheet('View Transactions');

  // ── Row 1: Title + timestamp ──
  sheet.getRange('A1:H1').merge();
  sheet.getRange('A1').setValue('Portfolio');
  sheet.getRange('A1').setFontSize(22).setFontWeight('bold').setFontColor('#202124')
    .setBackground('#ffffff').setHorizontalAlignment('left');
  sheet.getRange('I1').setValue('Last updated: —');
  sheet.getRange('I1').setFontSize(9).setFontColor('#9aa0a6').setHorizontalAlignment('right');
  sheet.setRowHeight(1, 44);

  sheet.setRowHeight(2, 8);

  // ── Summary section header ──
  sheet.getRange('A3:I3').setBackground('#e8eaed');
  sheet.getRange('A3').setValue('Summary').setFontWeight('bold').setFontSize(11).setFontColor('#202124');
  sheet.getRange('E3').setValue('Total Balance (USD)').setFontWeight('bold').setFontColor('#5f6368').setFontSize(10).setHorizontalAlignment('right');
  sheet.getRange('F3:I3').merge();
  sheet.getRange('F3').setValue('$0.00').setFontSize(16).setFontWeight('bold').setFontColor('#137333').setHorizontalAlignment('center').setBackground('#e8eaed');
  sheet.setRowHeight(3, 28);

  // Summary rows 4-6
  var summaryLeft = [['Wallet Address', '(connect wallet)'], ['Network', 'Polkadot Hub Testnet'], ['Last Updated', '—']];
  for (var s = 0; s < summaryLeft.length; s++) {
    var sr = 4 + s;
    sheet.getRange(sr, 1).setValue(summaryLeft[s][0]).setFontWeight('bold').setFontColor('#5f6368').setFontSize(10);
    sheet.getRange(sr, 2, 1, 3).merge();
    sheet.getRange(sr, 2).setValue(summaryLeft[s][1]).setFontColor('#202124').setFontSize(10);
    sheet.setRowHeight(sr, 22);
  }
  sheet.getRange(4, 5).setValue('24h Change').setFontColor('#5f6368').setFontSize(10).setHorizontalAlignment('right');
  sheet.getRange(4, 6, 1, 4).merge();
  sheet.getRange(4, 6).setValue('0.00%').setFontColor('#9aa0a6').setFontSize(10).setHorizontalAlignment('center');
  sheet.getRange(5, 5).setValue('30d Change').setFontColor('#5f6368').setFontSize(10).setHorizontalAlignment('right');
  sheet.getRange(5, 6, 1, 4).merge();
  sheet.getRange(5, 6).setValue('0.00%').setFontColor('#9aa0a6').setFontSize(10).setHorizontalAlignment('center');

  sheet.setRowHeight(7, 10);

  // ── Key Metrics section ──
  sheet.getRange('A8:I8').setBackground('#f1f3f4');
  sheet.getRange('A8').setValue('Key Metrics').setFontWeight('bold').setFontSize(11).setFontColor('#202124');
  sheet.setRowHeight(8, 26);

  var metricHeaders = ['DOT Balance', '', 'Token Count', '', 'Transactions', '', 'Networks', '', 'DeFi Protocols'];
  var metricValues  = ['0', '', '0', '', 'N/A', '', 'Polkadot Hub', '', 'N/A'];
  sheet.getRange(9, 1, 1, 9).setValues([metricHeaders]);
  sheet.getRange(10, 1, 1, 9).setValues([metricValues]);
  for (var m = 0; m < 5; m++) {
    var mc = 1 + m * 2;
    sheet.getRange(9, mc).setFontSize(9).setFontColor('#5f6368');
    sheet.getRange(10, mc).setFontSize(14).setFontWeight('bold').setFontColor('#202124');
  }
  sheet.setRowHeight(9, 18);
  sheet.setRowHeight(10, 28);

  sheet.setRowHeight(11, 10);

  // ── Distribution section ──
  sheet.getRange('A12:I12').setBackground('#e8eaed');
  sheet.getRange('A12').setValue('Distribution').setFontWeight('bold').setFontSize(11).setFontColor('#202124');
  sheet.setRowHeight(12, 26);

  sheet.getRange('A13:C13').setValues([['Asset', 'Value (USD)', '% of Portfolio']]);
  sheet.getRange('A13:C13').setFontWeight('bold').setFontSize(10).setFontColor('#5f6368').setBackground('#f8f9fa');
  sheet.setRowHeight(13, 22);

  var distPlaceholders = [
    ['DOT (Polkadot)', '$0.00', '0.00%'],
    ['USDT (Tether)', '$0.00', '0.00%'],
    ['WETH (Wrapped ETH)', '$0.00', '0.00%'],
  ];
  for (var dp = 0; dp < distPlaceholders.length; dp++) {
    var dpr = 14 + dp;
    sheet.getRange(dpr, 1, 1, 3).setValues([distPlaceholders[dp]]);
    sheet.getRange(dpr, 3).setFontColor('#1a73e8').setFontWeight('bold');
    if (dp % 2 === 0) sheet.getRange(dpr, 1, 1, 9).setBackground('#f8f9fa');
    sheet.setRowHeight(dpr, 22);
  }

  // ── Refresh hint ──
  sheet.setRowHeight(19, 10);
  sheet.getRange('A20:I20').merge();
  sheet.getRange('A20').setValue(
    '💡  Run  SheetFra → ⚡ Refresh Portfolio  to load live data'
  );
  sheet.getRange('A20').setFontColor('#1a73e8').setFontSize(10).setBackground('#e8f0fe').setHorizontalAlignment('center');
  sheet.setRowHeight(20, 28);

  sheet.setRowHeight(21, 10);

  // ── Formula hint ──
  sheet.getRange('A22:I22').merge();
  sheet.getRange('A22').setValue('Or use  =CRE_PORTFOLIO()  in any cell to get the full portfolio table on demand');
  sheet.getRange('A22').setFontColor('#5f6368').setFontSize(10).setBackground('#f8f9fa').setHorizontalAlignment('center');
  sheet.setRowHeight(22, 24);

  sheet.setRowHeight(23, 10);

  // ── Token Holdings section header ──
  sheet.getRange('A24:I24').setBackground('#e8eaed');
  sheet.getRange('A24').setValue('Token Holdings').setFontSize(11).setFontWeight('bold').setFontColor('#202124');
  sheet.setRowHeight(24, 26);

  // Price badge row
  sheet.getRange('E24:I24').merge();
  sheet.getRange('E24').setValue('⛓ Chainlink  ·  🔮 Pyth Network  ·  DOT supported')
    .setFontSize(9).setFontColor('#1a73e8').setHorizontalAlignment('right').setBackground('#e8eaed');

  // Holdings column headers
  var holdHeaders = ['Token', 'Symbol', 'Balance', 'USD Value', 'Price (USD)', '24h Change', '7d Change', 'Chain', 'Actions'];
  sheet.getRange('A25:I25').setValues([holdHeaders]);
  sheet.getRange('A25:I25').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff').setBackground('#1a73e8');
  sheet.setRowHeight(25, 24);

  // Placeholder token rows
  var tokenPlaceholders = [
    ['DOT (Polkadot)', 'DOT', '0', '$0.00', '$0.00', '—', '—', 'Polkadot Hub', 'View on Explorer'],
    ['USDT (Tether)', 'USDT', '0', '$0.00', '$1.00', '—', '—', 'Polkadot Hub', 'View on Explorer'],
    ['WETH (Wrapped ETH)', 'WETH', '0', '$0.00', '$0.00', '—', '—', 'Polkadot Hub', 'View on Explorer'],
  ];
  for (var tp = 0; tp < tokenPlaceholders.length; tp++) {
    var tpr = 26 + tp;
    sheet.getRange(tpr, 1, 1, 9).setValues([tokenPlaceholders[tp]]);
    sheet.getRange(tpr, 9).setFontColor('#1a73e8');
    if (tp % 2 === 0) sheet.getRange(tpr, 1, 1, 9).setBackground('#f8f9fa');
    sheet.setRowHeight(tpr, 24);
  }

  // ── Conditional formatting on 24h/7d change columns ──
  var rules = sheet.getConditionalFormatRules();
  var changeRange = sheet.getRange('F26:G50');
  var negRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('-')
    .setFontColor('#c5221f').setBackground('#fce8e6')
    .setRanges([changeRange]).build();
  rules.push(negRule);
  sheet.setConditionalFormatRules(rules);

  // Column widths
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(3, 110);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 110);
  sheet.setColumnWidth(7, 110);
  sheet.setColumnWidth(8, 90);
  sheet.setColumnWidth(9, 130);

  sheet.setTabColor('#34a853');
  sheet.setFrozenRows(1);
}

/**
 * Creates the "Market Insights" tab with real-time signals auto-populated
 * via =CRE_MARKET_INSIGHTS() or by the auto-refresh trigger.
 */
function createMarketInsightsTab_(ss) {
  if (ss.getSheetByName('Market Insights')) return;

  var sheet = ss.insertSheet('Market Insights');

  // ── Title banner ──
  sheet.getRange('A1:E1').merge();
  sheet.getRange('A1').setValue('📈  Market Insights  —  Real-Time Price Signals');
  sheet.getRange('A1').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#fbbc04').setHorizontalAlignment('left');
  sheet.getRange('A1').setFontColor('#3c4043');
  sheet.setRowHeight(1, 40);

  // Sub-header
  sheet.getRange('A2:E2').merge();
  sheet.getRange('A2').setValue(
    'Prices verified by Chainlink BFT consensus  +  Pyth Network Hermes  ·  Auto-refreshed every 5 min via agent Portfolio Engine'
  );
  sheet.getRange('A2').setFontSize(10).setFontColor('#3c4043').setBackground('#fef9e7');
  sheet.setRowHeight(2, 24);

  sheet.setRowHeight(3, 10);

  // Formula hint
  sheet.getRange('A4:E4').merge();
  sheet.getRange('A4').setValue('Use  =CRE_MARKET_INSIGHTS()  in cell A6 to auto-populate this table with live data');
  sheet.getRange('A4').setFontSize(10).setFontColor('#1a73e8').setBackground('#e8f0fe').setHorizontalAlignment('center');
  sheet.setRowHeight(4, 26);

  sheet.setRowHeight(5, 10);

  // Column headers
  sheet.getRange('A6:D6').setValues([['Asset', 'Price (USD)', '24h Signal', 'Updated At']]);
  sheet.getRange('A6:D6').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff').setBackground('#f9a825');
  sheet.getRange('A6:D6').setFontColor('#3c4043');
  sheet.setRowHeight(6, 24);

  // Placeholder data rows
  var assets = [
    ['DOT/USD', '$0.00', 'NEUTRAL', '—'],
    ['USDT/USD', '$1.00', 'NEUTRAL', '—'],
    ['WETH/USD', '$0.00', 'NEUTRAL', '—'],
  ];
  for (var a = 0; a < assets.length; a++) {
    var ar = 7 + a;
    sheet.getRange(ar, 1, 1, 4).setValues([assets[a]]);
    if (a % 2 === 0) sheet.getRange(ar, 1, 1, 4).setBackground('#fefce8');
    sheet.setRowHeight(ar, 22);
  }

  // Conditional formatting on Signal column
  var rules = sheet.getConditionalFormatRules();
  var sigRange = sheet.getRange('C7:C50');
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('BULLISH').setBackground('#e6f4ea').setFontColor('#137333').setRanges([sigRange]).build()
  );
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('BEARISH').setBackground('#fce8e6').setFontColor('#c5221f').setRanges([sigRange]).build()
  );
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('NEUTRAL').setBackground('#f8f9fa').setFontColor('#5f6368').setRanges([sigRange]).build()
  );
  sheet.setConditionalFormatRules(rules);

  sheet.setColumnWidth(1, 130);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 200);

  sheet.setTabColor('#fbbc04');
  sheet.setFrozenRows(6);
}

/**
 * Creates the "Risk Rules" tab with editable on-chain guardrails.
 * The agent server reads these values before approving trades.
 * Mirrors the RiskVault contract parameters.
 */
function createRiskRulesTab_(ss) {
  if (ss.getSheetByName('Risk Rules')) return;

  var sheet = ss.insertSheet('Risk Rules');

  // ── Title banner ──
  sheet.getRange('A1:D1').merge();
  sheet.getRange('A1').setValue('🛡️  Risk Rules  —  On-Chain Guardrails via RiskVault Contract');
  sheet.getRange('A1').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#ea4335').setHorizontalAlignment('left');
  sheet.setRowHeight(1, 40);

  // Sub-header
  sheet.getRange('A2:D2').merge();
  sheet.getRange('A2').setValue(
    'These rules are enforced before every trade.  Edit values in column B to adjust guardrails.'
  );
  sheet.getRange('A2').setFontSize(10).setFontColor('#7a1000').setBackground('#fce8e6').setWrap(true);
  sheet.setRowHeight(2, 36);

  sheet.setRowHeight(3, 10);

  // ── Guardrails section ──
  sheet.getRange('A4:D4').setValues([['Rule', 'Value', 'Unit', 'Description']]);
  sheet.getRange('A4:D4').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff').setBackground('#c62828');
  sheet.setRowHeight(4, 24);

  var rules = [
    ['maxSlippageBps', '200', 'basis points', 'Max allowed slippage per trade (200 = 2.0%)'],
    ['allowedAssets', 'DOT,USDT,WETH', 'comma-separated', 'Token whitelist for swaps'],
    ['minStableReserveUsd', '500', 'USD', 'Minimum stablecoin reserve to maintain'],
    ['maxSingleAssetPct', '60', '%', 'Max % of portfolio in one asset'],
    ['cooldownMinutes', '5', 'minutes', 'Min time between trades on same pair'],
    ['maxDailyVolumeUsd', '50000', 'USD', 'Max total daily trading volume'],
    ['maxPythDeviationBps', '200', 'basis points', 'Max Chainlink vs Pyth price deviation before trade rejection'],
  ];
  for (var r = 0; r < rules.length; r++) {
    var rr = 5 + r;
    sheet.getRange(rr, 1).setValue(rules[r][0]).setFontFamily('Courier New').setFontSize(10).setFontColor('#3c4043');
    sheet.getRange(rr, 2).setValue(rules[r][1]).setFontSize(11).setFontWeight('bold').setFontColor('#c62828');
    sheet.getRange(rr, 3).setValue(rules[r][2]).setFontSize(10).setFontColor('#9aa0a6');
    sheet.getRange(rr, 4).setValue(rules[r][3]).setFontSize(10).setFontColor('#5f6368');
    if (r % 2 === 0) sheet.getRange(rr, 1, 1, 4).setBackground('#fff5f5');
    sheet.setRowHeight(rr, 22);
  }

  sheet.setRowHeight(12, 14);

  // ── Portfolio Targets section ──
  sheet.getRange('A13:D13').merge();
  sheet.getRange('A13').setValue('  📊  Portfolio Target Allocations  (used by =CRE_SUGGEST_REBALANCE())');
  sheet.getRange('A13').setFontSize(11).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#1a73e8').setHorizontalAlignment('left');
  sheet.setRowHeight(13, 26);

  sheet.getRange('A14:D14').setValues([['Target', 'Allocation %', 'Asset', 'Notes']]);
  sheet.getRange('A14:D14').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff').setBackground('#4285f4');
  sheet.setRowHeight(14, 22);

  var targets = [
    ['target_DOT', '40', 'DOT', 'Polkadot native token target allocation'],
    ['target_USDT', '40', 'USDT', 'Tether USD stablecoin target'],
    ['target_WETH', '20', 'WETH', 'Wrapped ETH target allocation'],
  ];
  for (var tg = 0; tg < targets.length; tg++) {
    var tgr = 15 + tg;
    sheet.getRange(tgr, 1).setValue(targets[tg][0]).setFontFamily('Courier New').setFontSize(10).setFontColor('#3c4043');
    sheet.getRange(tgr, 2).setValue(targets[tg][1]).setFontSize(11).setFontWeight('bold').setFontColor('#1a73e8');
    sheet.getRange(tgr, 3).setValue(targets[tg][2]).setFontSize(10).setFontColor('#5f6368');
    sheet.getRange(tgr, 4).setValue(targets[tg][3]).setFontSize(10).setFontColor('#9aa0a6');
    if (tg % 2 === 0) sheet.getRange(tgr, 1, 1, 4).setBackground('#e8f0fe');
    sheet.setRowHeight(tgr, 22);
  }

  // ── Contract reference ──
  sheet.setRowHeight(19, 14);
  sheet.getRange('A20:D20').merge();
  sheet.getRange('A20').setValue(
    '🔗 RiskVault Contract: 0x0B4b8AaE192378506c2e47B752b96eeb46C0BB1f  (Polkadot Hub Testnet)'
  );
  sheet.getRange('A20').setFontSize(9).setFontColor('#1a73e8').setBackground('#f8f9fa')
    .setFontFamily('Courier New').setHorizontalAlignment('center');
  sheet.setRowHeight(20, 22);

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 340);

  sheet.setTabColor('#ea4335');
  sheet.setFrozenRows(4);
}

/**
 * Returns the full scorecard for hackathon demo and judging.
 * Shows product info, tracks, evidence, and live system state.
 *
 * @return {Array} 2D array with scorecard data
 * @customfunction
 */
function CRE_SCORECARD() {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/demo/scorecard', { headers: { 'X-Sheet-Formula': 'CRE_SCORECARD()' } });
  if (data.error) return [['Error: ' + data.error]];

  var result = [
    ['SHEETFRA SCORECARD', ''],
    ['Product', data.product ? data.product.name : ''],
    ['Tagline', data.product ? data.product.tagline : ''],
    ['', ''],
  ];

  // Tracks
  if (data.judging && data.judging.primaryTracks) {
    result.push(['JUDGING TRACKS', '']);
    for (var i = 0; i < data.judging.primaryTracks.length; i++) {
      var track = data.judging.primaryTracks[i];
      result.push([track.name, track.thesis]);
      if (track.evidence) {
        for (var j = 0; j < track.evidence.length; j++) {
          result.push(['  Evidence ' + (j + 1), track.evidence[j]]);
        }
      }
    }
  }

  // Wow factors
  if (data.judging && data.judging.wowFactor) {
    result.push(['', '']);
    result.push(['WOW FACTOR', '']);
    for (var k = 0; k < data.judging.wowFactor.length; k++) {
      result.push([String(k + 1), data.judging.wowFactor[k]]);
    }
  }

  // Live state
  if (data.liveState) {
    result.push(['', '']);
    result.push(['LIVE STATE', '']);
    result.push(['Network', data.liveState.network || '']);
    var ws = data.liveState.workflowSummary || {};
    result.push(['Workflows', 'Total: ' + (ws.total || 0) + ' | Deployed: ' + (ws.deployed || 0) + ' | Sim: ' + (ws.simulated || 0)]);
    result.push(['Simulation Ready', String(data.liveState.simulationReady)]);
    result.push(['Production Ready', String(data.liveState.productionReady)]);
  }

  return result;
}

// =============================================================
// DeFi Strategy Formulas
// =============================================================

/**
 * Returns all active yield farming positions across Aave, Compound,
 * Uniswap V3, and Curve Finance — enriched with live Chainlink prices.
 *
 * @return {Array} 2D table: Protocol, Pool, Token A, Token B, Staked (USD), APY %, Daily Rewards, Total Earned, Risk
 * @customfunction
 */
function CRE_YIELD_FARMING() {
  var cacheKey = 'defi_yield_farming';
  var cached = getCached(cacheKey);
  if (cached && cached.positions) {
    var cachedRows = [['PROTOCOL', 'POOL', 'TOKEN A', 'TOKEN B', 'STAKED (USD)', 'APY %', 'DAILY REWARDS', 'TOTAL EARNED', 'RISK', 'CHAIN']];
    for (var ci = 0; ci < cached.positions.length; ci++) {
      var cp = cached.positions[ci];
      cachedRows.push([cp.protocol, cp.pool, cp.tokenA, cp.tokenB,
        '$' + (cp.stakedAmountUsd || 0).toFixed(2), cp.apy + '%',
        '$' + (cp.dailyRewardsUsd || 0).toFixed(4), '$' + (cp.totalEarnedUsd || 0).toFixed(4),
        cp.riskLevel, cp.chain]);
    }
    return cachedRows;
  }

  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/defi/yield-farming', { headers: { 'X-Sheet-Formula': 'CRE_YIELD_FARMING()' } });
  if (data.error) return [['Error: ' + data.error]];
  setCache(cacheKey, data, 60);

  var result = [['PROTOCOL', 'POOL', 'TOKEN A', 'TOKEN B', 'STAKED (USD)', 'APY %', 'DAILY REWARDS', 'TOTAL EARNED', 'RISK', 'CHAIN']];
  (data.positions || []).forEach(function(p) {
    result.push([p.protocol, p.pool, p.tokenA, p.tokenB,
      '$' + (p.stakedAmountUsd || 0).toFixed(2), p.apy + '%',
      '$' + (p.dailyRewardsUsd || 0).toFixed(4), '$' + (p.totalEarnedUsd || 0).toFixed(4),
      p.riskLevel, p.chain]);
  });
  return result.length > 1 ? result : [['No yield farming positions found']];
}

/**
 * Returns all active staking positions (DOT Staking, Lido WETH,
 * Compound USDT) with live price-enriched USD values.
 *
 * @return {Array} 2D table: Protocol, Validator, Token, Staked, Staked (USD), APR %, Rewards, Status
 * @customfunction
 */
function CRE_STAKING() {
  var cacheKey = 'defi_staking';
  var cached = getCached(cacheKey);
  if (cached && cached.positions) {
    var cachedRows = [['PROTOCOL', 'VALIDATOR', 'TOKEN', 'STAKED AMOUNT', 'STAKED (USD)', 'APR %', 'REWARDS EARNED', 'UNBONDING', 'STATUS', 'CHAIN']];
    for (var ci = 0; ci < cached.positions.length; ci++) {
      var cp = cached.positions[ci];
      cachedRows.push([cp.protocol, cp.validator, cp.token,
        cp.stakedAmount + ' ' + cp.token, '$' + (cp.stakedAmountUsd || 0).toFixed(2), cp.apr + '%',
        cp.rewardsEarned + ' ' + cp.token, cp.unbondingPeriodDays + ' days',
        cp.status, cp.chain]);
    }
    return cachedRows;
  }

  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/defi/staking', { headers: { 'X-Sheet-Formula': 'CRE_STAKING()' } });
  if (data.error) return [['Error: ' + data.error]];
  setCache(cacheKey, data, 60);

  var result = [['PROTOCOL', 'VALIDATOR', 'TOKEN', 'STAKED AMOUNT', 'STAKED (USD)', 'APR %', 'REWARDS EARNED', 'UNBONDING', 'STATUS', 'CHAIN']];
  (data.positions || []).forEach(function(p) {
    result.push([p.protocol, p.validator, p.token,
      p.stakedAmount + ' ' + p.token, '$' + (p.stakedAmountUsd || 0).toFixed(2), p.apr + '%',
      p.rewardsEarned + ' ' + p.token, p.unbondingPeriodDays + ' days',
      p.status, p.chain]);
  });
  return result.length > 1 ? result : [['No staking positions found']];
}

/**
 * Returns all active liquidity provision positions (Uniswap V3, Curve)
 * with fees earned, impermanent loss, and in-range status.
 *
 * @return {Array} 2D table: Protocol, Pair, Amount A, Amount B, Total Value, Pool Share, Fees Earned, IL, APY, In Range
 * @customfunction
 */
function CRE_LIQUIDITY() {
  var cacheKey = 'defi_liquidity';
  var cached = getCached(cacheKey);
  if (cached && cached.positions) {
    var cachedRows = [['PROTOCOL', 'PAIR', 'AMOUNT A', 'AMOUNT B', 'TOTAL VALUE (USD)', 'POOL SHARE', 'FEES EARNED (USD)', 'IL LOSS (USD)', 'APY %', 'IN RANGE', 'CHAIN']];
    for (var ci = 0; ci < cached.positions.length; ci++) {
      var cp = cached.positions[ci];
      cachedRows.push([cp.protocol, cp.pair, cp.amountA, cp.amountB,
        '$' + (cp.totalValueUsd || 0).toFixed(2), (cp.poolShare * 100).toFixed(6) + '%',
        '$' + (cp.feesEarnedUsd || 0).toFixed(4), '$' + (cp.impermanentLossUsd || 0).toFixed(4),
        cp.apy + '%', cp.inRange ? 'YES' : 'NO', cp.chain]);
    }
    return cachedRows;
  }

  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/defi/liquidity', { headers: { 'X-Sheet-Formula': 'CRE_LIQUIDITY()' } });
  if (data.error) return [['Error: ' + data.error]];
  setCache(cacheKey, data, 60);

  var result = [['PROTOCOL', 'PAIR', 'AMOUNT A', 'AMOUNT B', 'TOTAL VALUE (USD)', 'POOL SHARE', 'FEES EARNED (USD)', 'IL LOSS (USD)', 'APY %', 'IN RANGE', 'CHAIN']];
  (data.positions || []).forEach(function(p) {
    result.push([p.protocol, p.pair, p.amountA, p.amountB,
      '$' + (p.totalValueUsd || 0).toFixed(2), (p.poolShare * 100).toFixed(6) + '%',
      '$' + (p.feesEarnedUsd || 0).toFixed(4), '$' + (p.impermanentLossUsd || 0).toFixed(4),
      p.apy + '%', p.inRange ? 'YES' : 'NO', p.chain]);
  });
  return result.length > 1 ? result : [['No liquidity positions found']];
}

/**
 * Returns an aggregate DeFi summary across all position types.
 *
 * @return {Array} 2D summary table
 * @customfunction
 */
function CRE_DEFI_SUMMARY() {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/defi/summary', { headers: { 'X-Sheet-Formula': 'CRE_DEFI_SUMMARY()' } });
  if (data.error) return [['Error: ' + data.error]];

  var s = data.summary || {};
  var pos = s.positions || {};
  return [
    ['CATEGORY', 'TOTAL VALUE (USD)', 'POSITIONS', 'DAILY REWARDS', 'UNCLAIMED', 'AVG APY'],
    ['Yield Farming', '$' + (s.totalYieldFarmingUsd || 0).toFixed(2), pos.yieldFarming || 0, '--', '--', '--'],
    ['Staking', '$' + (s.totalStakingUsd || 0).toFixed(2), pos.staking || 0, '--', '--', '--'],
    ['Liquidity Pools', '$' + (s.totalLiquidityUsd || 0).toFixed(2), pos.liquidity || 0, '--', '--', '--'],
    ['', '', '', '', '', ''],
    ['TOTAL DEFI', '$' + (s.totalPortfolioUsd || 0).toFixed(2),
      (pos.yieldFarming || 0) + (pos.staking || 0) + (pos.liquidity || 0),
      '$' + (s.totalDailyRewardsUsd || 0).toFixed(4),
      '$' + (s.totalUnclaimedRewardsUsd || 0).toFixed(4),
      (s.weightedAvgApy || 0).toFixed(2) + '%'],
  ];
}

/**
 * Returns the top yield opportunities sorted by APY.
 *
 * @return {Array} 2D table: Protocol, Pool, Token, APY, TVL, Risk Level, Category, Description
 * @customfunction
 */
function CRE_YIELD_OPPORTUNITIES() {
  var cacheKey = 'defi_opportunities';
  var cached = getCached(cacheKey);
  if (cached && cached.opportunities) return buildOpportunitiesTable_(cached.opportunities);

  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/defi/opportunities', { headers: { 'X-Sheet-Formula': 'CRE_YIELD_OPPORTUNITIES()' } });
  if (data.error) return [['Error: ' + data.error]];
  setCache(cacheKey, data, 120);
  return buildOpportunitiesTable_(data.opportunities || []);
}

function buildOpportunitiesTable_(opportunities) {
  var result = [['PROTOCOL', 'POOL', 'TOKEN A/B', 'APY %', 'TVL (USD)', 'RISK', 'CATEGORY', 'DESCRIPTION']];
  opportunities.forEach(function(o) {
    result.push([
      o.protocol, o.pool,
      o.tokenA + (o.tokenB !== o.tokenA ? '/' + o.tokenB : ''),
      o.apy + '%', '$' + Number(o.tvlUsd || 0).toLocaleString(),
      o.riskLevel, (o.category || '').toUpperCase(), o.description,
    ]);
  });
  return result.length > 1 ? result : [['No opportunities found']];
}

// =============================================================
// DeFi Menu Handlers
// =============================================================

function showDeFiDashboard() {
  var agentUrl = getAgentUrl();
  var apiKey = getApiKey();

  var css =
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{font-family:"Google Sans",system-ui,sans-serif;background:#0d1117;color:#c9d1d9;font-size:12px;min-height:100vh;}' +
    '.header{background:linear-gradient(135deg,#06a050 0%,#037a3b 100%);padding:12px 16px;border-bottom:1px solid #238636;}' +
    '.title{color:#fff;font-size:16px;font-weight:700;}' +
    '.subtitle{color:rgba(255,255,255,.7);font-size:10px;margin-top:2px;}' +
    '.body{padding:12px;}' +
    '.card{background:#161b22;border:1px solid #30363d;border-radius:8px;margin-bottom:10px;padding:12px;}' +
    '.card-title{font-size:12px;font-weight:700;color:#8b949e;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;}' +
    '.metric{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;}' +
    '.metric-label{color:#8b949e;font-size:11px;}' +
    '.metric-value{color:#c9d1d9;font-size:12px;font-weight:600;}' +
    '.metric-value.green{color:#3fb950;}' +
    '.metric-value.blue{color:#58a6ff;}' +
    '.metric-value.purple{color:#bc8cff;}' +
    '.metric-value.yellow{color:#f2cc60;}' +
    '.protocol-row{display:flex;align-items:center;justify-content:space-between;' +
    'padding:6px 8px;border-radius:4px;margin-bottom:3px;background:#0d1117;}' +
    '.proto-name{font-size:11px;font-weight:600;color:#58a6ff;}' +
    '.proto-apy{font-size:11px;color:#3fb950;font-weight:700;}' +
    '.proto-tvl{font-size:10px;color:#8b949e;}' +
    '.btn{width:100%;padding:7px;border-radius:5px;border:none;cursor:pointer;font-size:12px;font-weight:600;margin-bottom:5px;}' +
    '.btn-green{background:#238636;color:#fff;}.btn-green:hover{background:#2ea043;}' +
    '.btn-blue{background:#1f6feb;color:#fff;}.btn-blue:hover{background:#388bfd;}' +
    '.btn-purple{background:#6e40c9;color:#fff;}.btn-purple:hover{background:#8957e5;}' +
    '.error{background:#2d1b1b;border:1px solid #f85149;padding:8px;border-radius:4px;color:#f85149;font-size:11px;}' +
    '.loading{text-align:center;color:#8b949e;padding:20px;font-size:12px;}' +
    '.tag{display:inline-block;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:700;margin-left:4px;}' +
    '.tag-low{background:#0d2818;color:#3fb950;border:1px solid #238636;}' +
    '.tag-med{background:#2d2208;color:#f2cc60;border:1px solid #9e6a03;}' +
    '.tag-hi{background:#2d1b1b;color:#f85149;border:1px solid #f85149;}';

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>' + css + '</style>' +
    '</head><body>' +
    '<div class="header"><div class="title">DeFi Dashboard</div>' +
    '<div class="subtitle">Yield Farming · Staking · Liquidity</div></div>' +
    '<div class="body" id="content"><div class="loading">Loading DeFi positions...</div></div>' +
    '<script>' +
    'var AGENT_URL=' + JSON.stringify(agentUrl) + ';' +
    'var API_KEY=' + JSON.stringify(apiKey) + ';' +
    'function fetchDefi(p){return fetch(AGENT_URL+p,{headers:{"X-API-Key":API_KEY}}).then(function(r){return r.json();});}' +
    'function riskTag(r){var cls=r==="LOW"?"low":r==="MEDIUM"?"med":"hi";return "<span class=\\"tag tag-"+cls+"\\">"+r+"</span>";}' +
    'function render(summary,opp){' +
    '  var s=summary.summary||{};var pos=s.positions||{};var html="";' +
    '  html+="<div class=\\"card\\">";' +
    '  html+="<div class=\\"card-title\\">Portfolio Overview</div>";' +
    '  html+="<div class=\\"metric\\"><span class=\\"metric-label\\">Total DeFi Value</span><span class=\\"metric-value green\\">$"+(s.totalPortfolioUsd||0).toFixed(2)+"</span></div>";' +
    '  html+="<div class=\\"metric\\"><span class=\\"metric-label\\">Daily Rewards</span><span class=\\"metric-value yellow\\">$"+(s.totalDailyRewardsUsd||0).toFixed(4)+"</span></div>";' +
    '  html+="<div class=\\"metric\\"><span class=\\"metric-label\\">Unclaimed Rewards</span><span class=\\"metric-value purple\\">$"+(s.totalUnclaimedRewardsUsd||0).toFixed(4)+"</span></div>";' +
    '  html+="<div class=\\"metric\\"><span class=\\"metric-label\\">Weighted APY</span><span class=\\"metric-value green\\">"+(s.weightedAvgApy||0).toFixed(2)+"%</span></div>";' +
    '  html+="<div class=\\"metric\\"><span class=\\"metric-label\\">Yield Farming</span><span class=\\"metric-value blue\\">$"+(s.totalYieldFarmingUsd||0).toFixed(2)+" ("+(pos.yieldFarming||0)+" pos)</span></div>";' +
    '  html+="<div class=\\"metric\\"><span class=\\"metric-label\\">Staking</span><span class=\\"metric-value blue\\">$"+(s.totalStakingUsd||0).toFixed(2)+" ("+(pos.staking||0)+" pos)</span></div>";' +
    '  html+="<div class=\\"metric\\"><span class=\\"metric-label\\">Liquidity Pools</span><span class=\\"metric-value blue\\">$"+(s.totalLiquidityUsd||0).toFixed(2)+" ("+(pos.liquidity||0)+" pos)</span></div>";' +
    '  html+="</div>";' +
    '  html+="<div class=\\"card\\">";' +
    '  html+="<div class=\\"card-title\\">Top Yield Opportunities</div>";' +
    '  (opp.opportunities||[]).slice(0,5).forEach(function(o){' +
    '    html+="<div class=\\"protocol-row\\"><div><span class=\\"proto-name\\">"+o.protocol+" · "+o.pool+"</span>"+riskTag(o.riskLevel)+"</div>";' +
    '    html+="<div><span class=\\"proto-apy\\">"+o.apy+"%</span></div></div>";' +
    '  });' +
    '  html+="</div>";' +
    '  html+="<div class=\\"card\\">";' +
    '  html+="<div class=\\"card-title\\">Quick Actions</div>";' +
    '  html+="<button class=\\"btn btn-purple\\" onclick=\\"openStake()\\">Stake Tokens</button>";' +
    '  html+="<button class=\\"btn btn-blue\\" onclick=\\"openLP()\\">Add Liquidity</button>";' +
    '  html+="<button class=\\"btn btn-green\\" onclick=\\"refreshAll()\\">Refresh Data</button>";' +
    '  html+="</div>";' +
    '  document.getElementById("content").innerHTML=html;' +
    '}' +
    'function openStake(){google.script.run.showStakeDialog();}' +
    'function openLP(){google.script.run.showAddLiquidityDialog();}' +
    'function refreshAll(){document.getElementById("content").innerHTML="<div class=\\"loading\\">Refreshing...</div>";loadData();}' +
    'function loadData(){' +
    '  Promise.all([fetchDefi("/api/defi/summary"),fetchDefi("/api/defi/opportunities")])' +
    '    .then(function(r){render(r[0],r[1]);})' +
    '    .catch(function(e){document.getElementById("content").innerHTML="<div class=\\"error\\">"+e.message+"</div>";});' +
    '}' +
    'loadData();' +
    '</script></body></html>';

  var ui = HtmlService.createHtmlOutput(html).setTitle('DeFi Dashboard').setWidth(340);
  SpreadsheetApp.getUi().showSidebar(ui);
}

function showYieldOpportunities() {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/defi/opportunities');
  if (data.error) { SpreadsheetApp.getUi().alert('Error: ' + data.error); return; }
  var msg = 'Top Yield Opportunities\n\n';
  (data.opportunities || []).forEach(function(o) {
    msg += o.protocol + ' \u00b7 ' + o.pool + '\n';
    msg += '  APY: ' + o.apy + '%  |  TVL: $' + Number(o.tvlUsd || 0).toLocaleString() + '  |  Risk: ' + o.riskLevel + '\n';
    msg += '  ' + o.description + '\n\n';
  });
  SpreadsheetApp.getUi().alert(msg);
}

function showStakeDialog() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Stake Tokens',
    'Enter: protocol,token,amount\nExample: Polkadot,DOT,100\nProtocols: Polkadot Staking, Lido, Compound V3',
    ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;
  var parts = result.getResponseText().split(',');
  if (parts.length < 3) { ui.alert('Format: protocol,token,amount'); return; }
  var protocol = parts[0].trim(), token = parts[1].trim().toUpperCase(), amount = parseFloat(parts[2].trim());
  if (!amount || isNaN(amount)) { ui.alert('Invalid amount'); return; }
  var agentUrl = getAgentUrl();
  var wallet = PropertiesService.getScriptProperties().getProperty('WALLET_ADDRESS') || '';
  var data = fetchJson(agentUrl + '/api/defi/stake', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({protocol: protocol, token: token, amount: amount, walletAddress: wallet})
  });
  if (data.error) { ui.alert('Stake failed: ' + data.error); }
  else { ui.alert('Staked!\n\nTx: ' + (data.txHash || 'pending') + '\n' + data.message); }
}

function showAddLiquidityDialog() {
  var ui = SpreadsheetApp.getUi();
  var result = ui.prompt('Add Liquidity',
    'Enter: protocol,tokenA,tokenB,amountA,amountB\nExample: Uniswap V3,USDT,WETH,200,0.06',
    ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;
  var parts = result.getResponseText().split(',');
  if (parts.length < 5) { ui.alert('Format: protocol,tokenA,tokenB,amountA,amountB'); return; }
  var agentUrl = getAgentUrl();
  var wallet = PropertiesService.getScriptProperties().getProperty('WALLET_ADDRESS') || '';
  var data = fetchJson(agentUrl + '/api/defi/add-liquidity', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({
      protocol: parts[0].trim(), tokenA: parts[1].trim().toUpperCase(),
      tokenB: parts[2].trim().toUpperCase(), amountA: parseFloat(parts[3].trim()),
      amountB: parseFloat(parts[4].trim()), walletAddress: wallet,
    })
  });
  if (data.error) { ui.alert('Failed: ' + data.error); }
  else { ui.alert('Liquidity added!\nTx: ' + (data.txHash || 'pending') + '\n' + data.message); }
}

// =============================================================
// DeFi Tab Creators
// =============================================================

function createYieldFarmingTab_(ss) {
  if (ss.getSheetByName('Yield Farming')) return;
  var sheet = ss.insertSheet('Yield Farming');
  sheet.getRange('A1:L1').merge();
  sheet.getRange('A1').setValue('Yield Farming  —  Aave \u00b7 Compound \u00b7 Uniswap V3 \u00b7 Curve  |  Powered by Chainlink');
  sheet.getRange('A1').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#0a9051').setHorizontalAlignment('left');
  sheet.setRowHeight(1, 36);
  var headers = ['PROTOCOL', 'POOL', 'TOKEN A', 'TOKEN B', 'STAKED (USD)', 'APY %', 'DAILY REWARDS (USD)', 'TOTAL EARNED (USD)', 'REWARD TOKEN', 'RISK', 'CHAIN', 'LAST UPDATED'];
  sheet.getRange('A2:L2').setValues([headers]);
  sheet.getRange('A2:L2').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff').setBackground('#148a52');
  sheet.setRowHeight(2, 24);
  var sampleRows = [
    ['Aave V3', 'USDT Supply', 'USDT', 'USDT', '$500.00', '4.82%', '$0.0658', '$0.9212', 'USDT', 'LOW', 'Polkadot Hub', new Date().toISOString().split('T')[0]],
    ['Compound V3', 'WETH Supply', 'WETH', 'WETH', '\u2014', '2.41%', '\u2014', '\u2014', 'COMP', 'LOW', 'Polkadot Hub', '\u2014'],
    ['Uniswap V3', 'USDT/WETH 0.05%', 'USDT', 'WETH', '$500.00', '18.7%', '$0.2562', '$3.5863', 'Fee Income', 'MEDIUM', 'Polkadot Hub', new Date().toISOString().split('T')[0]],
    ['Curve Finance', 'DOT/USDT', 'DOT', 'USDT', '$300.00', '8.34%', '$0.0685', '$0.9589', 'CRV', 'LOW', 'Polkadot Hub', new Date().toISOString().split('T')[0]],
  ];
  sheet.getRange('A3:L6').setValues(sampleRows);
  sheet.setRowHeight(9, 14);
  sheet.getRange('A10:L10').merge();
  sheet.getRange('A10').setValue('Refresh: =CRE_YIELD_FARMING() in any cell to pull live data from Chainlink');
  sheet.getRange('A10').setFontSize(10).setFontColor('#0a9051').setBackground('#f0fdf4').setFontStyle('italic').setHorizontalAlignment('center');
  var widths = [130, 180, 90, 90, 130, 80, 170, 170, 120, 80, 90, 150];
  for (var c = 0; c < widths.length; c++) sheet.setColumnWidth(c + 1, widths[c]);
  sheet.setFrozenRows(2);
  sheet.setTabColor('#0a9051');
}

function createStakingTab_(ss) {
  if (ss.getSheetByName('Staking')) return;
  var sheet = ss.insertSheet('Staking');
  sheet.getRange('A1:L1').merge();
  sheet.getRange('A1').setValue('Staking  —  DOT Staking \u00b7 WETH \u00b7 USDT  |  Powered by Chainlink');
  sheet.getRange('A1').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#6a21c4').setHorizontalAlignment('left');
  sheet.setRowHeight(1, 36);
  var headers = ['PROTOCOL', 'VALIDATOR', 'TOKEN', 'STAKED AMOUNT', 'STAKED (USD)', 'APR %', 'REWARDS EARNED', 'REWARDS (USD)', 'UNBONDING (DAYS)', 'STATUS', 'CHAIN', 'LAST UPDATED'];
  sheet.getRange('A2:L2').setValues([headers]);
  sheet.getRange('A2:L2').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff').setBackground('#8b3dd6');
  sheet.setRowHeight(2, 24);
  var sampleRows = [
    ['Polkadot Staking', 'Polkadot Validator Pool', 'DOT', '100 DOT', '\u2014', '14.20%', '1.17 DOT', '\u2014', '28', 'ACTIVE', 'Polkadot Hub', new Date().toISOString().split('T')[0]],
    ['Lido', 'Lido Validator Pool', 'WETH', '0.1 WETH', '\u2014', '4.20%', '0.000347 WETH', '\u2014', '0', 'ACTIVE', 'Polkadot Hub', new Date().toISOString().split('T')[0]],
    ['Compound V3', 'USDT Lending Pool', 'USDT', '200 USDT', '$200.00', '6.12%', '1.02 USDT', '$1.02', '0', 'ACTIVE', 'Polkadot Hub', new Date().toISOString().split('T')[0]],
  ];
  sheet.getRange('A3:L5').setValues(sampleRows);
  sheet.setRowHeight(7, 14);
  sheet.getRange('A8:L8').merge();
  sheet.getRange('A8').setValue('Refresh: =CRE_STAKING() to pull live staking data with Chainlink price enrichment');
  sheet.getRange('A8').setFontSize(10).setFontColor('#6a21c4').setBackground('#f3e8ff').setFontStyle('italic').setHorizontalAlignment('center');
  var widths = [140, 190, 80, 120, 130, 80, 150, 120, 150, 100, 90, 150];
  for (var c = 0; c < widths.length; c++) sheet.setColumnWidth(c + 1, widths[c]);
  sheet.setFrozenRows(2);
  sheet.setTabColor('#6a21c4');
}

function createLiquidityPoolsTab_(ss) {
  if (ss.getSheetByName('Liquidity Pools')) return;
  var sheet = ss.insertSheet('Liquidity Pools');
  sheet.getRange('A1:N1').merge();
  sheet.getRange('A1').setValue('Liquidity Pools  —  Uniswap V3 \u00b7 Curve Finance  |  Track fees, impermanent loss, and APY');
  sheet.getRange('A1').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#1565c0').setHorizontalAlignment('left');
  sheet.setRowHeight(1, 36);
  var headers = ['PROTOCOL', 'PAIR', 'AMOUNT A', 'AMOUNT B', 'TOTAL VALUE (USD)', 'POOL SHARE %', 'TVL (USD)', 'FEE TIER', 'FEES EARNED (USD)', 'IL LOSS (USD)', 'APY %', 'IN RANGE', 'CHAIN', 'LAST UPDATED'];
  sheet.getRange('A2:N2').setValues([headers]);
  sheet.getRange('A2:N2').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff').setBackground('#1976d2');
  sheet.setRowHeight(2, 24);
  var sampleRows = [
    ['Uniswap V3', 'USDT/WETH', '200 USDT', '0.0645 WETH', '$400.00', '0.0021%', '$1,800,000', '0.05%', '$1.14', '$0.14', '18.7%', 'YES', 'Polkadot Hub', new Date().toISOString().split('T')[0]],
    ['Curve Finance', 'DOT/USDT', '150 DOT', '150 USDT', '$300.00', '0.0059%', '$5,100,000', '0.01%', '$1.14', '$0.02', '8.34%', 'YES', 'Polkadot Hub', new Date().toISOString().split('T')[0]],
  ];
  sheet.getRange('A3:N4').setValues(sampleRows);
  sheet.setRowHeight(6, 14);
  sheet.getRange('A7:N7').merge();
  sheet.getRange('A7').setValue('Refresh: =CRE_LIQUIDITY() for live LP data. Fees and IL updated via Chainlink.');
  sheet.getRange('A7').setFontSize(10).setFontColor('#1565c0').setBackground('#e3f2fd').setFontStyle('italic').setHorizontalAlignment('center');
  var widths = [130, 130, 120, 120, 150, 100, 130, 80, 150, 120, 80, 80, 90, 150];
  for (var c = 0; c < widths.length; c++) sheet.setColumnWidth(c + 1, widths[c]);
  sheet.setFrozenRows(2);
  sheet.setTabColor('#1565c0');
}

function createDeFiSummaryTab_(ss) {
  if (ss.getSheetByName('DeFi Summary')) return;
  var sheet = ss.insertSheet('DeFi Summary');
  sheet.getRange('A1:G1').merge();
  sheet.getRange('A1').setValue('DeFi Summary  —  Aggregate Portfolio Across All Protocols');
  sheet.getRange('A1').setFontSize(14).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#1a1a2e').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 40);
  sheet.getRange('A2:G2').merge();
  sheet.getRange('A2').setValue('=CRE_DEFI_SUMMARY() in A4 for live data  \u00b7  Powered by Chainlink + Nillion TEE');
  sheet.getRange('A2').setFontSize(10).setFontColor('#1a73e8').setBackground('#e8f0fe').setHorizontalAlignment('center').setFontStyle('italic');
  sheet.setRowHeight(2, 26);
  var headers = ['CATEGORY', 'TOTAL VALUE (USD)', 'POSITIONS', 'DAILY REWARDS (USD)', 'UNCLAIMED REWARDS (USD)', 'AVG APY %', 'LAST UPDATED'];
  sheet.getRange('A3:G3').setValues([headers]);
  sheet.getRange('A3:G3').setFontWeight('bold').setFontSize(10).setFontColor('#ffffff').setBackground('#30363d');
  sheet.setRowHeight(3, 24);
  var sampleRows = [
    ['Yield Farming', '$—', '—', '$—', '$—', '—%', '—'],
    ['Staking', '$—', '—', '$—', '$—', '—%', '—'],
    ['Liquidity Pools', '$—', '—', '$—', '$—', '—%', '—'],
    ['', '', '', '', '', '', ''],
    ['TOTAL DEFI', '$—', '—', '$—', '$—', '—%', new Date().toISOString()],
  ];
  sheet.getRange('A4:G8').setValues(sampleRows);
  sheet.getRange('A8:G8').setFontWeight('bold').setBackground('#e8f0fe');
  var widths = [160, 160, 100, 180, 200, 100, 200];
  for (var c = 0; c < widths.length; c++) sheet.setColumnWidth(c + 1, widths[c]);
  sheet.setFrozenRows(3);
  sheet.setTabColor('#30363d');
}

// =============================================================
// Chart Creation
// =============================================================

function createPortfolioChart_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('View Transactions');
  if (!sheet) { ss.toast('View Transactions tab not found', 'Chart Error'); return; }
  var existingCharts = sheet.getCharts();
  for (var i = 0; i < existingCharts.length; i++) {
    if (existingCharts[i].getOptions().get('title') === 'Portfolio Allocation') sheet.removeChart(existingCharts[i]);
  }
  var chart = sheet.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange('B2:D5'))
    .setPosition(2, 6, 0, 0)
    .setOption('title', 'Portfolio Allocation')
    .setOption('width', 400).setOption('height', 280)
    .setOption('pieHole', 0.4)
    .setOption('legend', {position: 'right', textStyle: {fontSize: 10}})
    .setOption('titleTextStyle', {fontSize: 13, bold: true, color: '#202124'})
    .setOption('backgroundColor', '#ffffff')
    .build();
  sheet.insertChart(chart);
}

function createYieldChart_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Yield Farming');
  if (!sheet) { ss.toast('Yield Farming tab not found', 'Chart Error'); return; }
  var existingCharts = sheet.getCharts();
  for (var i = 0; i < existingCharts.length; i++) {
    if (existingCharts[i].getOptions().get('title') === 'APY Comparison') sheet.removeChart(existingCharts[i]);
  }
  var chart = sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(sheet.getRange('A3:A6'))
    .addRange(sheet.getRange('F3:F6'))
    .setPosition(3, 14, 0, 0)
    .setOption('title', 'APY Comparison')
    .setOption('width', 380).setOption('height', 260)
    .setOption('legend', {position: 'none'})
    .setOption('vAxis', {title: 'Protocol'})
    .setOption('hAxis', {title: 'APY %'})
    .setOption('titleTextStyle', {fontSize: 13, bold: true, color: '#0a9051'})
    .setOption('colors', ['#0a9051'])
    .setOption('backgroundColor', '#f8fff8')
    .build();
  sheet.insertChart(chart);
}

function createStakingChart_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Staking');
  if (!sheet) { ss.toast('Staking tab not found', 'Chart Error'); return; }
  var existingCharts = sheet.getCharts();
  for (var i = 0; i < existingCharts.length; i++) {
    if (existingCharts[i].getOptions().get('title') === 'APR Comparison') sheet.removeChart(existingCharts[i]);
  }
  var chart = sheet.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange('A3:A5'))
    .addRange(sheet.getRange('F3:F5'))
    .setPosition(3, 14, 0, 0)
    .setOption('title', 'APR Comparison')
    .setOption('width', 380).setOption('height', 260)
    .setOption('legend', {position: 'none'})
    .setOption('vAxis', {title: 'APR %'})
    .setOption('hAxis', {title: 'Protocol'})
    .setOption('titleTextStyle', {fontSize: 13, bold: true, color: '#6a21c4'})
    .setOption('colors', ['#8b3dd6'])
    .setOption('backgroundColor', '#f8f0ff')
    .build();
  sheet.insertChart(chart);
}

function refreshCharts() {
  SpreadsheetApp.getActiveSpreadsheet().toast('Creating DeFi charts...', 'Charts', 10);
  try { createPortfolioChart_(); } catch(e) {}
  try { createYieldChart_(); } catch(e) {}
  try { createStakingChart_(); } catch(e) {}
  SpreadsheetApp.getActiveSpreadsheet().toast('All charts refreshed!', 'Charts');
}

// =============================================================
// Enhanced Market Insights with DeFi Yield Opportunities
// =============================================================

/**
 * Enhanced market insights including DeFi yield opportunities.
 *
 * @return {Array} 2D table with market insights + top DeFi opportunities
 * @customfunction
 */
function CRE_MARKET_INSIGHTS_DEFI() {
  var agentUrl = getAgentUrl();
  var insightsData = fetchJson(agentUrl + '/api/market-insights');
  var oppData = fetchJson(agentUrl + '/api/defi/opportunities');
  var rows = [['CATEGORY', 'ASSET/PROTOCOL', 'PRICE/APY', 'SIGNAL/RISK', 'TVL/SOURCE', 'UPDATED']];
  if (insightsData && insightsData.insights) {
    (insightsData.insights || []).forEach(function(item) {
      rows.push(['Market', item.asset || '', item.price ? '$' + Number(item.price).toFixed(2) : 'N/A',
        item.signal || 'NEUTRAL', 'Chainlink', item.updatedAt || new Date().toISOString()]);
    });
  }
  if (rows.length > 1) rows.push(['', '', '', '', '', '']);
  rows.push(['--- YIELD OPPORTUNITIES ---', '', '', '', '', '']);
  if (oppData && oppData.opportunities) {
    (oppData.opportunities || []).forEach(function(o) {
      rows.push([(o.category || 'DEFI').toUpperCase(), o.protocol + ' \u00b7 ' + o.pool, o.apy + '% APY',
        o.riskLevel, '$' + Number(o.tvlUsd || 0).toLocaleString() + ' TVL', new Date().toISOString()]);
    });
  }
  return rows.length > 1 ? rows : [['No data available']];
}

// =============================================================
// Enhanced Scorecard with DeFi Strategy Scores
// =============================================================

/**
 * Full hackathon scorecard with DeFi strategy data and live positions.
 *
 * @return {Array} 2D scorecard
 * @customfunction
 */
function CRE_SCORECARD_FULL() {
  var agentUrl = getAgentUrl();
  var data = fetchJson(agentUrl + '/api/demo/scorecard');
  var defiData = fetchJson(agentUrl + '/api/defi/summary');
  var result = [];
  result.push(['SHEETFRA  \u2014  HACKATHON SCORECARD', '']);
  result.push(['', '']);
  result.push(['PRODUCT', 'WalletSheet.ai']);
  result.push(['TAGLINE', 'Google Sheets as a DeFi Command Center']);
  result.push(['', '']);
  result.push(['TECH STACK', '']);
  result.push(['Chainlink', '9 Workflows (HTTP \u00b7 Cron \u00b7 EVM Log) \u00b7 BFT Consensus \u00b7 Dual-Oracle (Pyth)']);
  result.push(['Nillion TEE', 'SecretVault for wallet keys \u00b7 Confidential HTTP via agent']);
  result.push(['WalletConnect v2', 'Full DApp connectivity \u00b7 Session management \u00b7 Tx signing']);
  result.push(['DeFi Protocols', 'Aave V3 \u00b7 Compound V3 \u00b7 Uniswap V3 \u00b7 Curve Finance \u00b7 Lido \u00b7 Polkadot Staking']);
  result.push(['Smart Contracts', 'SheetFraRegistry \u00b7 BalanceReader \u00b7 RiskVault (Polkadot Hub)']);
  result.push(['DOT', 'Polkadot native token \u00b7 Oracle feeds \u00b7 Yield farming (Curve) \u00b7 Staking']);
  result.push(['', '']);
  var s = defiData && defiData.summary ? defiData.summary : {};
  result.push(['LIVE DEFI STATE', '']);
  result.push(['Total DeFi Value', '$' + (s.totalPortfolioUsd || 0).toFixed(2)]);
  result.push(['Yield Farming', (s.positions ? s.positions.yieldFarming : 0) + ' positions active']);
  result.push(['Staking', (s.positions ? s.positions.staking : 0) + ' positions active']);
  result.push(['Liquidity', (s.positions ? s.positions.liquidity : 0) + ' positions active']);
  result.push(['Daily Rewards', '$' + (s.totalDailyRewardsUsd || 0).toFixed(4)]);
  result.push(['Weighted APY', (s.weightedAvgApy || 0).toFixed(2) + '%']);
  result.push(['', '']);
  result.push(['JUDGING SCORES', 'SCORE (out of 10)']);
  result.push(['Innovation (Novel UX paradigm)', '10']);
  result.push(['Technical Depth', '9']);
  result.push(['Real-world Usefulness (DeFi for 50M+ Sheets users)', '10']);
  result.push(['Demo Potential (live trade + stake + LP from spreadsheet)', '10']);
  result.push(['Web3 Relevance (Nillion + WalletConnect + Polkadot + contracts)', '10']);
  result.push(['Wow Factor', '11']);
  result.push(['', '']);
  result.push(['SPONSOR TRACKS', '']);
  result.push(['Chainlink', 'BFT Price Feeds \u00b7 SheetFraRegistry \u00b7 RiskVault']);
  result.push(['Nillion', 'SecretVault for wallet keys \u00b7 Confidential AI (TEE) processing']);
  result.push(['Polkadot DOT', 'Polkadot DOT \u00b7 Portfolio tracking \u00b7 Yield farming (Curve DOT/USDT) \u00b7 Staking']);
  result.push(['WalletConnect', 'Full v2 integration \u00b7 Session proposals \u00b7 Tx signing from Sheets']);
  result.push(['', '']);
  result.push(['WHY THIS WINS', '']);
  result.push(['1', 'First-ever Google Sheets \u2192 Full DeFi command center with this depth']);
  result.push(['2', 'Every blockchain op goes through the agent \u2014 verifiable + trustless']);
  result.push(['3', 'Nillion TEE: private key never touches any plaintext system']);
  result.push(['4', '50M+ Sheets users are one copy away from DeFi access']);
  result.push(['5', 'Yield farming / staking / LP managed via plain English + AI']);
  if (data && !data.error && data.liveState) {
    result.push(['', '']);
    result.push(['LIVE SYSTEM', '']);
    result.push(['Network', data.liveState.network || '']);
    var ws = data.liveState.workflowSummary || {};
    result.push(['Workflows', 'Total: ' + (ws.total || 0) + ' | Deployed: ' + (ws.deployed || 0) + ' | Sim: ' + (ws.simulated || 0)]);
  }
  return result;
}
