import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const model = fs.readFileSync(path.join(root, 'cube', 'model', 'ai_token_usage.yml'), 'utf8');
const roadmap = fs.readFileSync(path.join(root, 'specs', 'ROADMAP_integration_hometown.md'), 'utf8');
const state = fs.readFileSync(path.join(root, 'specs', 'STATE.md'), 'utf8');
const failures = [];

for (const snippet of [
  'hometown reads this ledger through ekg_cube_reader',
  'Ledger-owned facts stay here',
  'FROM public."LiteLLM_SpendLogs"'
]) {
  if (!model.includes(snippet)) failures.push(`ai_token_usage boundary text missing: ${snippet}`);
}

for (const snippet of [
  'hometown never writes to the ledger',
  'hometown does NOT own: the gateway, virtual keys, budgets, provider credentials, gateway infrastructure',
  'The gateway is deliberately semantics-blind'
]) {
  if (!roadmap.includes(snippet)) failures.push(`integrated roadmap boundary missing: ${snippet}`);
}

if (!state.includes('hometown reads that ledger through `ekg_cube_reader`')) {
  failures.push('STATE.md must preserve ekg_cube_reader read-only ledger boundary.');
}

if (failures.length > 0) {
  console.error('Gateway access-boundary verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Gateway access-boundary verification passed. hometown scope remains read-only semantic modeling over the Popeye ledger.');