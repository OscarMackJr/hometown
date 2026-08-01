import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), 'cube', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createCubeToken(secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: Math.floor(Date.now() / 1000) }));
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${payload}.${signature}`;
}

loadLocalEnv();
const cubeUrl = process.env.CUBE_SANDBOX_URL ?? process.env.CUBE_SMOKE_URL ?? process.env.CUBE_URL ?? 'http://localhost:4000';
const apiSecret = process.env.CUBEJS_API_SECRET;
if (!apiSecret) {
  console.error('Missing required env var: CUBEJS_API_SECRET');
  process.exit(1);
}

async function load(query) {
  const response = await fetch(`${cubeUrl}/cubejs-api/v1/load`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${createCubeToken(apiSecret)}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Cube query failed with ${response.status}: ${text}`);
  return JSON.parse(text).data ?? [];
}

const baseQuery = {
  measures: [
    'ai_token_usage.request_count',
    'ai_token_usage.total_cost_usd',
    'ai_token_usage.total_tokens'
  ],
  order: { 'ai_token_usage.total_cost_usd': 'desc' },
  limit: Number(process.env.GATEWAY_CHARGEBACK_LIMIT ?? 10)
};

const queries = [
  ['byApplication', ['ai_token_usage.app_id']],
  ['byUser', ['ai_token_usage.user_id']],
  ['byModel', ['ai_token_usage.model']],
  ['byCloud', ['ai_token_usage.provider']]
];

const output = {};
try {
  for (const [name, dimensions] of queries) {
    output[name] = await load({ ...baseQuery, dimensions });
  }
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('LiteLLM_SpendLogs') && message.includes('does not exist')) {
    console.error('Gateway chargeback query could not run because public."LiteLLM_SpendLogs" is not present in the connected Cube database. Connect the Popeye gateway ledger or seed a non-production ledger table, then rerun this command.');
    process.exit(1);
  }
  console.error(message);
  process.exit(1);
}