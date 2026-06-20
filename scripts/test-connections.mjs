#!/usr/bin/env node
/**
 * ArbScout API Connection Tester
 * Run with: node scripts/test-connections.mjs
 *
 * Tests connectivity to all three data sources and prints a clear report.
 * Copy .env.local.example to .env.local first and fill in your credentials.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv needed)
function loadEnv() {
  try {
    const env = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
    for (const line of env.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    }
    console.log('✓ Loaded .env.local\n');
  } catch {
    console.log('⚠  No .env.local found — using environment variables as-is\n');
  }
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }
function info(msg) { console.log(`  ℹ  ${msg}`); }
function header(msg) { console.log(`\n─── ${msg} ${'─'.repeat(Math.max(0, 50 - msg.length))}`); }

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ─── 1. POLYMARKET ──────────────────────────────────────────────────────────
async function testPolymarket() {
  header('Polymarket (public API — no credentials needed)');
  try {
    const res = await fetchWithTimeout(
      'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=5&order=volume24hr&ascending=false'
    );
    if (!res.ok) { fail(`HTTP ${res.status}`); return; }
    const data = await res.json();
    pass(`Connected — ${data.length} markets returned`);
    if (data[0]) {
      info(`Top market: "${data[0].question}"`);
      const prices = JSON.parse(data[0].outcomePrices || '[]');
      if (prices.length >= 2) info(`YES: ${(parseFloat(prices[0]) * 100).toFixed(1)}¢  NO: ${(parseFloat(prices[1]) * 100).toFixed(1)}¢`);
    }
  } catch (err) {
    fail(`Connection failed: ${err.message}`);
    info('Check your internet connection or VPN status');
  }
}

// ─── 2. KALSHI ───────────────────────────────────────────────────────────────
async function testKalshi() {
  header('Kalshi');
  const email = process.env.KALSHI_EMAIL;
  const password = process.env.KALSHI_PASSWORD;

  if (!email || !password) {
    fail('KALSHI_EMAIL and KALSHI_PASSWORD not set in .env.local');
    info('Add them to .env.local and re-run this script');
    return;
  }
  info(`Using account: ${email}`);

  try {
    // Login
    const loginRes = await fetchWithTimeout('https://trading-api.kalshi.com/trade-api/v2/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!loginRes.ok) {
      const body = await loginRes.text();
      fail(`Login failed (${loginRes.status}): ${body.slice(0, 120)}`);
      return;
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    pass('Login successful — got auth token');

    // Fetch markets
    const marketsRes = await fetchWithTimeout('https://trading-api.kalshi.com/trade-api/v2/markets?status=open&limit=5', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!marketsRes.ok) { fail(`Markets request failed: ${marketsRes.status}`); return; }

    const marketsData = await marketsRes.json();
    const markets = marketsData.markets || [];
    pass(`Fetched ${markets.length} open markets (limited to 5 for test)`);
    if (markets[0]) {
      const m = markets[0];
      const yes = ((m.yes_bid + m.yes_ask) / 2 / 100 * 100).toFixed(1);
      const no = ((m.no_bid + m.no_ask) / 2 / 100 * 100).toFixed(1);
      info(`Sample: "${m.title}" — YES: ${yes}¢  NO: ${no}¢`);
    }

    // Fetch account balance
    const balRes = await fetchWithTimeout('https://trading-api.kalshi.com/trade-api/v2/portfolio/balance', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (balRes.ok) {
      const bal = await balRes.json();
      const available = bal.balance ? (bal.balance / 100).toFixed(2) : 'N/A';
      pass(`Account balance: $${available}`);
    }

  } catch (err) {
    fail(`Error: ${err.message}`);
  }
}

// ─── 3. IBKR CLIENT PORTAL GATEWAY ──────────────────────────────────────────
async function testIBKR() {
  header('IBKR ForecastEx (Client Portal Gateway)');

  const host = process.env.IBKR_HOST || 'http://localhost:5000';
  info(`Trying to reach: ${host}`);

  // Check if IBKR_HOST is set
  if (!process.env.IBKR_HOST) {
    info('IBKR_HOST not set in .env.local — testing default http://localhost:5000');
  }

  try {
    // Step 1: Check if gateway is reachable at all
    const statusRes = await fetchWithTimeout(`${host}/v1/api/iserver/auth/status`, {}, 4000);

    if (!statusRes.ok) {
      fail(`Gateway responded with HTTP ${statusRes.status}`);
      printIBKRSetupHelp();
      return;
    }

    const status = await statusRes.json();
    pass('Client Portal Gateway is running and reachable');

    if (!status.authenticated) {
      fail('Gateway is running but NOT logged in');
      info('Open the Client Portal Gateway window and complete the login flow');
      info('Then re-run this test');
      return;
    }

    pass(`Authenticated — competing ${status.competing ? 'YES' : 'NO'}`);

    // Step 2: Get account list
    const accountsRes = await fetchWithTimeout(`${host}/v1/api/iserver/accounts`);
    if (accountsRes.ok) {
      const accounts = await accountsRes.json();
      const ids = accounts.accounts || [];
      pass(`Account(s) found: ${ids.join(', ')}`);
    }

    // Step 3: Search for ForecastEx event contracts
    info('Searching for ForecastEx event contracts (this may take a moment)...');
    const searchRes = await fetchWithTimeout(`${host}/v1/api/iserver/secdef/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'Federal Reserve', secType: '', name: true, isNameSearch: true }),
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const forecastex = (searchData || []).filter(
        c => c.exchange === 'FORECASTX' || c.exchange === 'ForecastEx'
      );
      if (forecastex.length > 0) {
        pass(`Found ${forecastex.length} ForecastEx event contracts for "Federal Reserve"`);
        info(`Example: "${forecastex[0].companyName}" (conid: ${forecastex[0].conid})`);
      } else {
        info(`Search returned ${(searchData || []).length} results but none on FORECASTX exchange`);
        info('Note: ForecastEx contracts may only appear in live (not paper) accounts');
      }
    }

  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ECONNREFUSED' || err.message.includes('fetch')) {
      fail('Cannot reach Client Portal Gateway — it is not running');
      printIBKRSetupHelp();
    } else {
      fail(`Error: ${err.message}`);
    }
  }
}

function printIBKRSetupHelp() {
  console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  HOW TO SET UP THE CLIENT PORTAL GATEWAY                    │
  │                                                             │
  │  The Gateway is a separate Java app (different from TWS).   │
  │                                                             │
  │  1. Go to: https://ibkr.com/en/software/api/               │
  │     Click "Client Portal API" → download the zip file       │
  │                                                             │
  │  2. Unzip and run:                                          │
  │       Windows: clientportal.gw/bin/run.bat root/conf.yaml   │
  │       Mac/Linux: ./clientportal.gw/bin/run.sh root/conf.yaml│
  │                                                             │
  │  3. Open https://localhost:5000 in your browser             │
  │     Log in with your IBKR username + password               │
  │                                                             │
  │  4. Add IBKR_HOST=http://localhost:5000 to .env.local       │
  │     Then re-run: node scripts/test-connections.mjs          │
  │                                                             │
  │  Your TWS (on port 4002) can stay open alongside this.      │
  └─────────────────────────────────────────────────────────────┘`);
}

// ─── 4. ARBITRAGE PAIR PREVIEW ───────────────────────────────────────────────
async function testArbitragePreview() {
  header('Arbitrage pair preview (Kalshi vs Polymarket)');
  const email = process.env.KALSHI_EMAIL;
  const password = process.env.KALSHI_PASSWORD;
  if (!email || !password) {
    info('Skipping — Kalshi credentials not set');
    return;
  }

  try {
    // Get Kalshi token
    const loginRes = await fetchWithTimeout('https://trading-api.kalshi.com/trade-api/v2/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) { info('Skipping preview — Kalshi login failed'); return; }
    const { token } = await loginRes.json();

    // Fetch top Kalshi markets
    const kRes = await fetchWithTimeout('https://trading-api.kalshi.com/trade-api/v2/markets?status=open&limit=20', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const kData = await kRes.json();
    const kalshiMarkets = kData.markets || [];

    // Fetch top Polymarket markets
    const pRes = await fetchWithTimeout(
      'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=20&order=volume24hr&ascending=false'
    );
    const polyMarkets = await pRes.json();

    // Very simple keyword match
    let pairs = 0;
    for (const km of kalshiMarkets) {
      const kWords = (km.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
      for (const pm of polyMarkets) {
        const pWords = (pm.question || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const shared = kWords.filter(w => pWords.includes(w));
        if (shared.length >= 3) {
          pairs++;
          const kYes = ((km.yes_bid + km.yes_ask) / 2 / 100);
          const pYes = parseFloat((JSON.parse(pm.outcomePrices || '["0","0"]'))[0]);
          const kNo = ((km.no_bid + km.no_ask) / 2 / 100);
          const pNo = parseFloat((JSON.parse(pm.outcomePrices || '["0","0"]'))[1]);
          const cost1 = kYes + pNo; // buy YES on Kalshi, NO on Poly
          const cost2 = pYes + kNo; // buy YES on Poly, NO on Kalshi
          const bestCost = Math.min(cost1, cost2);
          const profit = ((1 - bestCost) / bestCost * 100).toFixed(2);
          const flag = bestCost < 1.0 ? '💰 ARB!' : '      ';
          console.log(`  ${flag} "${km.title.slice(0,45).padEnd(45)}" ↔ Poly ← cost ${(bestCost*100).toFixed(1)}¢  profit ${profit}%`);
          if (pairs >= 5) break;
        }
      }
      if (pairs >= 5) break;
    }
    if (pairs === 0) {
      info('No obvious cross-platform matches found in top 20 markets from each platform');
      info('The full app uses deeper fuzzy matching — run `npm run dev` to see it');
    } else {
      pass(`Found ${pairs} rough market pair(s) — see the full app for precise analysis`);
    }
  } catch (err) {
    info(`Preview error: ${err.message}`);
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║       ArbScout — API Connection Test         ║');
  console.log('╚══════════════════════════════════════════════╝');

  loadEnv();

  await testPolymarket();
  await testKalshi();
  await testIBKR();
  await testArbitragePreview();

  header('Done');
  console.log('\n  Next steps:');
  console.log('  • Run the full app:  npm run dev');
  console.log('  • Open:             http://localhost:3000\n');
}

main().catch(console.error);
