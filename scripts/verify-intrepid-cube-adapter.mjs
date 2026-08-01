import fs from 'node:fs';
import path from 'node:path';
import IntrepidLoanEngineIntegration from '../dist/integrations/intrepid_loan_engine/index.js';

const liveMode = process.argv.includes('--live') || process.env.INTREPID_CUBE_ADAPTER_VERIFY === 'live';
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function requireIncludes(label, content, snippets) {
  for (const snippet of snippets) {
    if (!content.includes(snippet)) failures.push(`${label} missing: ${snippet}`);
  }
}

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

function verifyStaticContract() {
  const source = read('src/integrations/intrepid_loan_engine/index.ts');
  requireIncludes('Intrepid Cube adapter source', source, [
    "public integrationId = 'intrepid_loan_engine'",
    "public supportedEntities = ['LoanProcessingRun']",
    "const mode = (process.env.INTREPID_INTEGRATION_MODE ?? 'mock').toLowerCase()",
    "const tenantId = this.requireEnv('INTREPID_TENANT_ID')",
    "member: 'intrepid_loan_runs.tenant_id'",
    "member: 'intrepid_loans.tenant_id'",
    "member: 'intrepid_loan_exceptions.tenant_id'",
    'values: [tenantId]',
    "Authorization: `Bearer ${token}`",
    'createCubeToken(apiSecret)',
    'tenantScoped: true',
    'rlsContextRequired: true'
  ]);
}

async function verifyLiveAdapter() {
  loadLocalEnv();
  process.env.INTREPID_INTEGRATION_MODE = 'cube';

  const runId = process.env.INTREPID_SANDBOX_RUN_ID ?? 'INTREPID_RUN_2026_Q2_001';
  const integration = new IntrepidLoanEngineIntegration();
  const record = await integration.fetchContext(runId);

  console.log(JSON.stringify(record, null, 2));
}

verifyStaticContract();

if (liveMode) {
  await verifyLiveAdapter();
}

if (failures.length > 0) {
  console.error('Intrepid Cube adapter verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const modeLabel = liveMode ? 'static and live Cube' : 'static contract';
console.log(`Intrepid Cube adapter verification passed (${modeLabel}).`);
