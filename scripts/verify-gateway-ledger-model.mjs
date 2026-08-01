import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const modelPath = path.join(root, 'cube', 'model', 'ai_token_usage.yml');
const model = fs.readFileSync(modelPath, 'utf8');
const failures = [];
const liveMode = process.argv.includes('--live') || process.env.GATEWAY_LEDGER_VERIFY === 'live';

const expectedProjectionSnippets = [
  'name: ai_token_usage',
  'public."LiteLLM_SpendLogs"',
  'request_id',
  'team_id AS app_id',
  '"user" AS user_id',
  "metadata->'spend_logs_metadata'->>'tenant_id' AS tenant_id",
  "metadata->'spend_logs_metadata'->>'feature_tag' AS feature_tag",
  "metadata->'spend_logs_metadata'->>'agent_id' AS agent_id",
  'model',
  'custom_llm_provider AS provider',
  'custom_llm_provider AS cloud',
  'spend AS cost_usd',
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'request_duration_ms AS latency',
  '"startTime" AS created_at'
];

const expectedSemanticFields = [
  'name: request_id',
  'primary_key: true',
  'name: app_id',
  'name: user_id',
  'name: tenant_id',
  'name: feature_tag',
  'name: agent_id',
  'name: model',
  'name: provider',
  'name: cloud',
  'name: total_cost_usd',
  'name: total_tokens',
  'name: prompt_tokens',
  'name: completion_tokens',
  'name: avg_latency',
  'name: desktop_agent_traffic'
];

const retiredBrokenProjectionSnippets = [
  'api_key_alias AS app_id',
  'spend_logs_metadata->',
  'startTime AS created_at'
];
const retiredBrokenProjectionLines = ['latency,'];

const requiredPhysicalColumns = new Map([
  ['request_id', { allowedTypes: ['text', 'character varying', 'uuid'] }],
  ['team_id', { allowedTypes: ['text', 'character varying'] }],
  ['user', { allowedTypes: ['text', 'character varying'] }],
  ['metadata', { allowedTypes: ['json', 'jsonb'] }],
  ['model', { allowedTypes: ['text', 'character varying'] }],
  ['custom_llm_provider', { allowedTypes: ['text', 'character varying'] }],
  ['spend', { allowedTypes: ['numeric', 'double precision', 'real', 'integer', 'bigint'] }],
  ['prompt_tokens', { allowedTypes: ['integer', 'bigint', 'numeric'] }],
  ['completion_tokens', { allowedTypes: ['integer', 'bigint', 'numeric'] }],
  ['total_tokens', { allowedTypes: ['integer', 'bigint', 'numeric'] }],
  ['request_duration_ms', { allowedTypes: ['integer', 'bigint', 'numeric', 'double precision', 'real'] }],
  ['startTime', { allowedTypes: ['timestamp with time zone', 'timestamp without time zone'] }]
]);

function requireIncludes(label, snippets) {
  for (const snippet of snippets) {
    if (!model.includes(snippet)) failures.push(`${label} missing: ${snippet}`);
  }
}

function forbidIncludes(label, snippets) {
  for (const snippet of snippets) {
    if (model.includes(snippet)) failures.push(`${label} still contains retired broken projection: ${snippet}`);
  }
}

function runPsql(sql) {
  const commonArgs = [
    '--no-password',
    '--set', 'ON_ERROR_STOP=1',
    '--tuples-only',
    '--no-align',
    '--field-separator', '\t',
    '--command', sql
  ];

  if (process.env.GATEWAY_LEDGER_PSQL_DSN) {
    const result = spawnSync('psql', [process.env.GATEWAY_LEDGER_PSQL_DSN, ...commonArgs], { encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') throw new Error('psql was not found on PATH. Use GATEWAY_LEDGER_POSTGRES_CONTAINER or install psql.');
    if (result.status !== 0) throw new Error(`psql exit ${result.status}: ${result.stderr.trim()}`);
    return result.stdout;
  }

  const container = process.env.GATEWAY_LEDGER_POSTGRES_CONTAINER;
  const database = process.env.GATEWAY_LEDGER_POSTGRES_DB;
  const user = process.env.GATEWAY_LEDGER_POSTGRES_USER;
  const password = process.env.GATEWAY_LEDGER_POSTGRES_PASSWORD;
  if (!container || !database || !user || !password) {
    throw new Error('Live ledger schema verification requires either GATEWAY_LEDGER_PSQL_DSN or GATEWAY_LEDGER_POSTGRES_CONTAINER, GATEWAY_LEDGER_POSTGRES_DB, GATEWAY_LEDGER_POSTGRES_USER, and GATEWAY_LEDGER_POSTGRES_PASSWORD.');
  }

  const result = spawnSync('docker', [
    'exec',
    '-e', `PGPASSWORD=${password}`,
    container,
    'psql',
    '--dbname', database,
    '--username', user,
    ...commonArgs
  ], { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') throw new Error('docker was not found on PATH. Start Docker Desktop or use GATEWAY_LEDGER_PSQL_DSN.');
  if (result.status !== 0) throw new Error(`docker exec ${container} psql exit ${result.status}: ${result.stderr.trim()}`);
  return result.stdout;
}

function verifyLiveSchema() {
  const sql = `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LiteLLM_SpendLogs' ORDER BY ordinal_position;`;
  const rows = runPsql(sql)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const columns = new Map(rows.map((row) => {
    const [name, dataType] = row.split('\t');
    return [name, dataType];
  }));

  for (const [columnName, expectation] of requiredPhysicalColumns) {
    const actualType = columns.get(columnName);
    if (!actualType) {
      failures.push(`live LiteLLM_SpendLogs schema missing physical column: ${columnName}`);
      continue;
    }
    if (!expectation.allowedTypes.includes(actualType)) {
      failures.push(`live LiteLLM_SpendLogs column ${columnName} has type ${actualType}; expected one of ${expectation.allowedTypes.join(', ')}`);
    }
  }
}

requireIncludes('ai_token_usage model projection', expectedProjectionSnippets);
requireIncludes('ai_token_usage semantic model', expectedSemanticFields);
forbidIncludes('ai_token_usage model', retiredBrokenProjectionSnippets);
const modelLines = model.split(/\r?\n/).map((line) => line.trim());
for (const retiredLine of retiredBrokenProjectionLines) {
  if (modelLines.includes(retiredLine)) failures.push('ai_token_usage model still contains retired broken projection line: ' + retiredLine);
}

for (const forbidden of ['INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ']) {
  if (model.toUpperCase().includes(forbidden)) {
    failures.push(`ai_token_usage model must be read-only and contains ${forbidden.trim()}`);
  }
}

if (liveMode) {
  verifyLiveSchema();
}

if (failures.length > 0) {
  console.error('Gateway ledger model verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const modeLabel = liveMode ? 'static and live schema' : 'static contract';
console.log(`Gateway ledger model verification passed (${modeLabel}).`);
