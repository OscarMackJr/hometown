import fs from 'node:fs';
import path from 'node:path';

const model = fs.readFileSync(path.join(process.cwd(), 'cube', 'model', 'ai_token_usage.yml'), 'utf8');
const required = [
  'api_key_alias AS app_id',
  'user_id',
  "spend_logs_metadata->>'tenant_id' AS tenant_id",
  "spend_logs_metadata->>'feature_tag' AS feature_tag",
  'name: app_id',
  'name: user_id',
  'name: tenant_id',
  'name: feature_tag',
  'name: model',
  'name: provider'
];
const failures = required.filter((snippet) => !model.includes(snippet));

if (failures.length > 0) {
  console.error('Gateway attribution verification failed:');
  for (const failure of failures) console.error(`- Missing attribution field: ${failure}`);
  process.exit(1);
}

console.log('Gateway attribution verification passed. Chargeback dimensions cover application, user, tenant, feature tag, model, and cloud/provider.');