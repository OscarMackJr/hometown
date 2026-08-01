import fs from 'node:fs';
import path from 'node:path';

const modelPath = path.join(process.cwd(), 'cube', 'model', 'ai_token_usage.yml');
const model = fs.readFileSync(modelPath, 'utf8');
const failures = [];

function requireIncludes(label, snippets) {
  for (const snippet of snippets) {
    if (!model.includes(snippet)) failures.push(`${label} missing: ${snippet}`);
  }
}

requireIncludes('ai_token_usage model', [
  'name: ai_token_usage',
  'public."LiteLLM_SpendLogs"',
  'request_id',
  'api_key_alias AS app_id',
  'user_id',
  "spend_logs_metadata->>'tenant_id' AS tenant_id",
  "spend_logs_metadata->>'feature_tag' AS feature_tag",
  'model',
  'custom_llm_provider AS provider',
  'spend AS cost_usd',
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'latency',
  'startTime AS created_at',
  'name: request_id',
  'primary_key: true',
  'name: app_id',
  'name: user_id',
  'name: tenant_id',
  'name: feature_tag',
  'name: model',
  'name: provider',
  'name: total_cost_usd',
  'name: total_tokens',
  'name: prompt_tokens',
  'name: completion_tokens',
  'name: avg_latency'
]);

for (const forbidden of ['INSERT ', 'UPDATE ', 'DELETE ', 'DROP ', 'ALTER ']) {
  if (model.toUpperCase().includes(forbidden)) {
    failures.push(`ai_token_usage model must be read-only and contains ${forbidden.trim()}`);
  }
}

if (failures.length > 0) {
  console.error('Gateway ledger model verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Gateway ledger model verification passed.');