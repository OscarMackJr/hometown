import fs from 'node:fs';
import path from 'node:path';
import IntrepidLoanEngineIntegration from '../dist/integrations/intrepid_loan_engine/index.js';

const envPath = path.join(process.cwd(), 'cube', '.env');
if (fs.existsSync(envPath)) {
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

process.env.INTREPID_INTEGRATION_MODE = 'cube';

const runId = process.env.INTREPID_SANDBOX_RUN_ID ?? 'INTREPID_RUN_2026_Q2_001';
const integration = new IntrepidLoanEngineIntegration();
const record = await integration.fetchContext(runId);

console.log(JSON.stringify(record, null, 2));
