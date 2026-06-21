/**
 * Polymarket CLOB API client — order placement
 *
 * Required env vars:
 *   POLY_PRIVATE_KEY   — Ethereum wallet private key (0x-prefixed or raw hex)
 *   POLY_API_KEY       — L2 API key  (from polymarket.com → Profile → API)
 *   POLY_SECRET        — L2 API secret
 *   POLY_PASSPHRASE    — L2 API passphrase
 *
 * How to get L2 credentials:
 *   1. Go to polymarket.com (use VPN if needed for browser access)
 *   2. Connect your wallet
 *   3. Profile → API → Generate API Key
 *   4. Copy the key/secret/passphrase into Vercel environment variables
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

const CLOB_API  = 'https://clob.polymarket.com';
const CHAIN_ID  = 137; // Polygon mainnet
// CTF Exchange contract on Polygon (standard markets)
const EXCHANGE  = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

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
  if (!raw) throw new Error('POLY_PRIVATE_KEY is not set in environment variables');
  // Accept with or without 0x prefix
  const pk = raw.startsWith('0x') ? raw : `0x${raw}`;
  return new ethers.Wallet(pk);
}

function getL2Creds(): { key: string; secret: string; passphrase: string } {
  const key        = process.env.POLY_API_KEY    ?? '';
  const secret     = process.env.POLY_SECRET     ?? '';
  const passphrase = process.env.POLY_PASSPHRASE ?? '';
  if (!key || !secret || !passphrase) {
    throw new Error(
      'Polymarket L2 credentials missing. Set POLY_API_KEY, POLY_SECRET, POLY_PASSPHRASE in Vercel env vars.',
    );
  }
  return { key, secret, passphrase };
}

// HMAC-SHA256 authentication headers for CLOB API requests
function makeClobHeaders(
  method: string,
  path: string,
  body: string,
  creds: { key: string; secret: string; passphrase: string },
  address: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message   = timestamp + method.toUpperCase() + path + body;
  // The secret is base64-encoded — decode it before using as HMAC key
  const sigBuf    = createHmac('sha256', Buffer.from(creds.secret, 'base64'))
    .update(message)
    .digest();
  const signature = sigBuf.toString('base64');

  return {
    'Content-Type':   'application/json',
    'POLY-ADDRESS':   address,
    'POLY-API-KEY':   creds.key,
    'POLY-SIGNATURE': signature,
    'POLY-TIMESTAMP': timestamp,
    'POLY-PASSPHRASE': creds.passphrase,
  };
}

export interface PolyOrderParams {
  tokenId: string;    // clobTokenIds[0] for YES, clobTokenIds[1] for NO
  side: 'yes' | 'no';
  price: number;      // 0–1 (e.g. 0.35 = 35¢)
  contracts: number;  // number of shares (integer)
}

export interface PolyOrderResult {
  orderId: string;
  status: string;
}

export async function placePolymarketOrder(params: PolyOrderParams): Promise<PolyOrderResult> {
  const wallet = getPolyWallet();
  const creds  = getL2Creds();

  // USDC has 6 decimals on Polygon
  // BUY: makerAmount = USDC you pay = contracts × price × 1e6
  //      takerAmount = shares you receive = contracts × 1e6
  const price6 = Math.round(params.price * 1e6);
  const makerAmount = BigInt(Math.round(params.contracts * params.price * 1e6));
  const takerAmount = BigInt(params.contracts * 1e6);
  const side        = 0; // 0 = BUY (we always buy YES or NO for arb)

  const orderData = {
    salt:          BigInt(Math.floor(Math.random() * 1e15)),
    maker:         wallet.address,
    signer:        wallet.address,
    taker:         '0x0000000000000000000000000000000000000000',
    tokenId:       BigInt(params.tokenId),
    makerAmount,
    takerAmount,
    expiration:    BigInt(0),
    nonce:         BigInt(0),
    feeRateBps:    BigInt(0),
    side,
    signatureType: 0, // 0 = EOA (regular wallet)
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
// Falls back to empty strings if the market can't be found
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
