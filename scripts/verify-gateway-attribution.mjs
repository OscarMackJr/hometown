import fs from 'node:fs';
import path from 'node:path';

const model = fs.readFileSync(path.join(process.cwd(), 'cube', 'model', 'ai_token_usage.yml'), 'utf8');
const required = [
  'team_id AS app_id',
  '"user" AS user_id',
  "metadata->'spend_logs_metadata'->>'tenant_id' AS tenant_id",
  "metadata->'spend_logs_metadata'->>'feature_tag' AS feature_tag",
  "metadata->'spend_logs_metadata'->>'agent_id' AS agent_id",
  'custom_llm_provider AS provider',
  'custom_llm_provider AS cloud',
  'name: app_id',
  'name: user_id',
  'name: tenant_id',
  'name: feature_tag',
  'name: agent_id',
  'name: model',
  'name: provider',
  'name: cloud',
  'name: desktop_agent_traffic'
];
const retired = [
  'api_key_alias AS app_id',
  'spend_logs_metadata->',
  'startTime AS created_at'
];
const retiredLines = ['latency,'];
const failures = [];

for (const snippet of required) {
  if (!model.includes(snippet)) failures.push(`Missing attribution field: ${snippet}`);
}
for (const snippet of retired) {
  if (model.includes(snippet)) failures.push(`Retired broken attribution projection still present: ${snippet}`);
}
const modelLines = model.split(/\r?\n/).map((line) => line.trim());
for (const retiredLine of retiredLines) {
  if (modelLines.includes(retiredLine)) failures.push('Retired broken attribution projection line still present: ' + retiredLine);
}

if (failures.length > 0) {
  console.error('Gateway attribution verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Gateway attribution verification passed. Chargeback dimensions cover application, user, tenant, feature tag, agent, model, provider, and cloud.');
