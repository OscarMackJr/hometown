import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';


function loadLocalEnv() {
  const envPath = path.join(process.cwd(), 'cube', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();
const cubeUrl = process.env.CUBE_SANDBOX_URL ?? process.env.CUBE_SMOKE_URL ?? 'http://localhost:4000';
const apiSecret = process.env.CUBEJS_API_SECRET;
const tenantId = process.env.INTREPID_TENANT_ID;
const expectedRunId = process.env.INTREPID_SANDBOX_RUN_ID;

const missing = [];
if (!apiSecret) missing.push('CUBEJS_API_SECRET');
if (!tenantId) missing.push('INTREPID_TENANT_ID');

if (missing.length > 0) {
  console.error(`Missing required sandbox env var(s): ${missing.join(', ')}`);
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createCubeToken(secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: Math.floor(Date.now() / 1000) }));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${header}.${payload}.${signature}`;
}

const filters = [
  {
    member: 'intrepid_loan_runs.tenant_id',
    operator: 'equals',
    values: [tenantId]
  }
];

if (expectedRunId) {
  filters.push({
    member: 'intrepid_loan_runs.run_id',
    operator: 'equals',
    values: [expectedRunId]
  });
}

const response = await fetch(`${cubeUrl}/cubejs-api/v1/load`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${createCubeToken(apiSecret)}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: {
      measures: ['intrepid_loan_runs.count'],
      dimensions: [
        'intrepid_loan_runs.run_id',
        'intrepid_loan_runs.status',
        'intrepid_loan_runs.as_of_date',
        'intrepid_loan_runs.created_at'
      ],
      filters,
      order: {
        'intrepid_loan_runs.created_at': 'desc'
      },
      limit: 1
    }
  })
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`Cube sandbox query failed with ${response.status}: ${body}`);
}

const parsed = JSON.parse(body);
const row = parsed.data?.[0];
if (!row) {
  throw new Error(`Cube sandbox query returned no Intrepid runs for tenant ${tenantId}.`);
}

if (expectedRunId && row['intrepid_loan_runs.run_id'] !== expectedRunId) {
  throw new Error(`Expected run ${expectedRunId}, got ${JSON.stringify(row)}`);
}

console.log(JSON.stringify({
  runId: row['intrepid_loan_runs.run_id'],
  status: row['intrepid_loan_runs.status'],
  asOfDate: row['intrepid_loan_runs.as_of_date'],
  createdAt: row['intrepid_loan_runs.created_at'],
  count: Number(row['intrepid_loan_runs.count'])
}, null, 2));

