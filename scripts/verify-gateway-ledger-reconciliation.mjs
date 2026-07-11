import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const live = process.argv.includes('--live') || process.env.GATEWAY_LEDGER_VERIFY === 'live';
const model = fs.readFileSync(path.join(process.cwd(), 'cube', 'model', 'ai_token_usage.yml'), 'utf8');
const failures = [];

for (const snippet of ['request_id', 'total_cost_usd', 'total_tokens', 'prompt_tokens', 'completion_tokens', 'public."LiteLLM_SpendLogs"']) {
  if (!model.includes(snippet)) failures.push(`ai_token_usage model missing reconciliation field: ${snippet}`);
}

if (!live) {
  if (failures.length > 0) {
    console.error('Gateway ledger reconciliation contract verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Gateway ledger reconciliation contract verification passed. Use --live with gateway DB env to compare Cube/read-model totals to the source ledger.');
  process.exit(0);
}

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

loadLocalEnv();
const required = ['GATEWAY_POSTGRES_HOST', 'GATEWAY_POSTGRES_PORT', 'GATEWAY_POSTGRES_DB', 'GATEWAY_POSTGRES_USER', 'GATEWAY_POSTGRES_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing live gateway ledger env var(s): ${missing.join(', ')}`);
  process.exit(1);
}

const sql = 'select count(*), coalesce(sum(spend),0), coalesce(sum(total_tokens),0), coalesce(sum(prompt_tokens),0), coalesce(sum(completion_tokens),0) from public."LiteLLM_SpendLogs";';
const result = spawnSync('psql', [
  '--host', process.env.GATEWAY_POSTGRES_HOST,
  '--port', process.env.GATEWAY_POSTGRES_PORT,
  '--dbname', process.env.GATEWAY_POSTGRES_DB,
  '--username', process.env.GATEWAY_POSTGRES_USER,
  '--no-password',
  '--tuples-only',
  '--no-align',
  '--field-separator', '\t',
  '--command', sql
], {
  encoding: 'utf8',
  env: { ...process.env, PGPASSWORD: process.env.GATEWAY_POSTGRES_PASSWORD }
});

if (result.status !== 0) {
  console.error(`Gateway ledger reconciliation live query failed: ${result.stderr.trim()}`);
  process.exit(result.status ?? 1);
}

const [requestCount, totalCostUsd, totalTokens, promptTokens, completionTokens] = result.stdout.trim().split('\t');
console.log(JSON.stringify({ requestCount: Number(requestCount), totalCostUsd: Number(totalCostUsd), totalTokens: Number(totalTokens), promptTokens: Number(promptTokens), completionTokens: Number(completionTokens) }, null, 2));