/**
 * Polymarket CLOB API client — order placement
 *
 * Required env var (only one!):
 *   POLY_PRIVATE_KEY — Ethereum wallet private key (hex, with or without 0x prefix)
 *
 * How to get it:
 *   polymarket.com → Settings → Account tab → "Private key" → "Start Export"
 *   Complete the export flow, copy the key, paste into Vercel env vars.
 *
 * The CLOB L2 credentials (key/secret/passphrase) are derived automatically
 * from the private key on first use — no manual steps needed beyond the key.
 *
 * How orders work:
 *   Each market has a YES token and a NO token. To arb, we:
 *   - BUY YES on Polymarket (side='yes') → use clobTokenIds[0]
 *   - BUY NO  on Polymarket (side='no')  → use clobTokenIds[1]
 *   Orders are EIP-712 signed with the Ethereum wallet, then submitted
 *   to the CLOB API with HMAC-SHA256 L2 auth headers.
 */

import { ethers } from 'ethers';
import { createHmac } from 'crypto';

const CLOB_API = 'https://clob.polymarket.com';
const CHAIN_ID = 137; // Polygon mainnet
// CTF Exchange contract on Polygon (standard markets)
const EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// EIP-712 typed data for the CTF Exchange Order struct
const ORDER_TYPES: Record<string, { name: string; type: string }[]> = {
  Order: [
    { name: 'salt',          type: 'uint256' },
    { name: 'maker',         type: 'address' },
    { name: 'signer',        type: 'address' },
    { name: 'taker',         type: 'address' },
    { name: 'tokenId',       type: 'uint256' },
    { name: 'makerAmount',   type: 'uint256' },
    { name: 'takerAmount',   type: 'uint256' },
    { name: 'expiration',    type: 'uint256' },
    { name: 'nonce',         type: 'uint256' },
    { name: 'feeRateBps',    type: 'uint256' },
    { name: 'side',          type: 'uint8'   },
    { name: 'signatureType', type: 'uint8'   },
  ],
};

const EIP712_DOMAIN = {
  name: 'Polymarket CTF Exchange',
  version: '1',
  chainId: CHAIN_ID,
  verifyingContract: EXCHANGE,
};

function getPolyWallet(): ethers.Wallet {
  const raw = process.env.POLY_PRIVATE_KEY ?? '';
  if (!raw) throw new Error('POLY_PRIVATE_KEY is not set. Export it from polymarket.com → Settings → Account → Private key → Start Export');
  const pk = raw.startsWith('0x') ? raw : `0x${raw}`;
  return new ethers.Wallet(pk);
}

// Module-level cache for the derived L2 credentials (valid per process lifetime)
let _cachedCreds: { key: string; secret: string; passphrase: string } | null = null;

// Derive CLOB L2 credentials from the L1 (Ethereum wallet) private key.
// This calls GET /auth/api-key with a personal_sign of the request message —
// the same derivation the official Polymarket SDK uses internally.
async function deriveL2Creds(
  wallet: ethers.Wallet,
): Promise<{ key: string; secret: string; passphrase: string }> {
  if (_cachedCreds) return _cachedCreds;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method    = 'GET';
  const path      = '/auth/api-key';

  // L1 auth: Ethereum personal_sign of "${timestamp}${METHOD}${path}"
  const msgBytes = ethers.toUtf8Bytes(`${timestamp}${method}${path}`);
  const signature = await wallet.signMessage(msgBytes);

  const res = await fetch(`${CLOB_API}${path}`, {
    headers: {
      'Content-Type':   'application/json',
      'POLY-ADDRESS':   wallet.address,
      'POLY-SIGNATURE': signature,
      'POLY-TIMESTAMP': timestamp,
      'POLY-NONCE':     '0',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Polymarket credential derivation failed (${res.status}): ${text.slice(0, 200)}`);
  }

  _cachedCreds = await res.json() as { key: string; secret: string; passphrase: string };
  return _cachedCreds;
}

// HMAC-SHA256 authentication headers for L2 CLOB API requests
function makeClobHeaders(
  method: string,
  path: string,
  body: string,
  creds: { key: string; secret: string; passphrase: string },
  address: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message   = timestamp + method.toUpperCase() + path + body;
  // Secret is base64-encoded — decode it before using as HMAC key
  const sig = createHmac('sha256', Buffer.from(creds.secret, 'base64'))
    .update(message)
    .digest('base64');

  return {
    'Content-Type':    'application/json',
    'POLY-ADDRESS':    address,
    'POLY-API-KEY':    creds.key,
    'POLY-SIGNATURE':  sig,
    'POLY-TIMESTAMP':  timestamp,
    'POLY-PASSPHRASE': creds.passphrase,
  };
}

export interface PolyOrderParams {
  tokenId: string;    // clobTokenIds[0] for YES, clobTokenIds[1] for NO
  side: 'yes' | 'no';
  price: number;      // 0–1 (e.g. 0.35 = 35¢)
  contracts: number;  // integer number of shares to buy
}

export interface PolyOrderResult {
  orderId: string;
  status: string;
}

export async function placePolymarketOrder(params: PolyOrderParams): Promise<PolyOrderResult> {
  const wallet = getPolyWallet();
  const creds  = await deriveL2Creds(wallet);

  // BUY order:
  //   makerAmount = USDC you pay = contracts × price (6 decimal places)
  //   takerAmount = shares you receive = contracts (6 decimal places)
  const makerAmount = BigInt(Math.round(params.contracts * params.price * 1e6));
  const takerAmount = BigInt(Math.round(params.contracts * 1e6));

  const orderData = {
    salt:          BigInt(Math.floor(Math.random() * 1e15)),
    maker:         wallet.address,
    signer:        wallet.address,
    taker:         '0x0000000000000000000000000000000000000000',
    tokenId:       BigInt(params.tokenId),
    makerAmount,
    takerAmount,
    expiration:    BigInt(0),  // no expiry
    nonce:         BigInt(0),
    feeRateBps:    BigInt(0),
    side:          0,          // 0 = BUY (we always buy the arb leg)
    signatureType: 0,          // 0 = EOA (regular wallet)
  };

  const signature = await wallet.signTypedData(EIP712_DOMAIN, ORDER_TYPES, orderData);

  // Serialize BigInts as strings for JSON
  const order = {
    salt:          orderData.salt.toString(),
    maker:         orderData.maker,
    signer:        orderData.signer,
    taker:         orderData.taker,
    tokenId:       orderData.tokenId.toString(),
    makerAmount:   orderData.makerAmount.toString(),
    takerAmount:   orderData.takerAmount.toString(),
    expiration:    orderData.expiration.toString(),
    nonce:         orderData.nonce.toString(),
    feeRateBps:    orderData.feeRateBps.toString(),
    side:          orderData.side,
    signatureType: orderData.signatureType,
    signature,
  };

  const bodyStr = JSON.stringify({ order, owner: wallet.address, orderType: 'GTC' });
  const path    = '/order';
  const headers = makeClobHeaders('POST', path, bodyStr, creds, wallet.address);

  const res = await fetch(`${CLOB_API}${path}`, {
    method: 'POST',
    headers,
    body: bodyStr,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Polymarket order failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return {
    orderId: data.orderID ?? data.order?.id ?? '',
    status:  data.status  ?? 'submitted',
  };
}

// Look up CLOB token IDs for a market by conditionId
export async function fetchClobTokenIds(conditionId: string): Promise<[string, string] | null> {
  try {
    const res = await fetch(`${CLOB_API}/markets/${conditionId}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tokens: { token_id: string }[] = data.tokens ?? [];
    if (tokens.length >= 2) return [tokens[0].token_id, tokens[1].token_id];
    return null;
  } catch {
    return null;
  }
}
