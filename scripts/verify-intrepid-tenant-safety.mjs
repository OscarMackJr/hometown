import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireIncludes(label, content, snippets) {
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      failures.push(`${label} is missing tenant-safety invariant: ${snippet}`);
    }
  }
}

const adapter = read('src/integrations/intrepid_loan_engine/index.ts');
requireIncludes('Intrepid Cube adapter', adapter, [
  "const tenantId = this.requireEnv('INTREPID_TENANT_ID')",
  "member: 'intrepid_loan_runs.tenant_id'",
  "member: 'intrepid_loans.tenant_id'",
  "member: 'intrepid_loan_exceptions.tenant_id'",
  'values: [tenantId]',
  'tenantScoped: true',
  'rlsContextRequired: true'
]);

const tenantScopedJoinSnippets = [
  '{CUBE}.tenant_id = {intrepid_loan_runs}.tenant_id',
  '{CUBE}.tenant_id = {intrepid_loans}.tenant_id',
  '{CUBE}.tenant_id = {intrepid_loan_exceptions}.tenant_id',
  '{CUBE}.tenant_id = {intrepid_portfolio_exceptions}.tenant_id'
];

const modelChecks = [
  {
    label: 'intrepid_loan_runs model',
    path: 'cube/model/intrepid_loan_runs.yml',
    snippets: [
      'name: tenant_id',
      '{CUBE}.tenant_id = {intrepid_loans}.tenant_id',
      '{CUBE}.tenant_id = {intrepid_loan_exceptions}.tenant_id',
      '{CUBE}.tenant_id = {intrepid_portfolio_exceptions}.tenant_id'
    ]
  },
  {
    label: 'intrepid_loans model',
    path: 'cube/model/intrepid_loans.yml',
    snippets: [
      'name: tenant_id',
      '{CUBE}.tenant_id = {intrepid_loan_runs}.tenant_id',
      '{CUBE}.tenant_id = {intrepid_loan_exceptions}.tenant_id'
    ]
  },
  {
    label: 'intrepid_loan_exceptions model',
    path: 'cube/model/intrepid_loan_exceptions.yml',
    snippets: [
      'name: tenant_id',
      '{CUBE}.tenant_id = {intrepid_loan_runs}.tenant_id',
      '{CUBE}.tenant_id = {intrepid_loans}.tenant_id'
    ]
  },
  {
    label: 'intrepid_portfolio_exceptions model',
    path: 'cube/model/intrepid_portfolio_exceptions.yml',
    snippets: [
      'name: tenant_id',
      '{CUBE}.tenant_id = {intrepid_loan_runs}.tenant_id'
    ]
  }
];

for (const check of modelChecks) {
  requireIncludes(check.label, read(check.path), check.snippets);
}

const combinedModels = modelChecks.map((check) => read(check.path)).join('\n');
for (const snippet of tenantScopedJoinSnippets) {
  if (!combinedModels.includes(snippet)) {
    failures.push(`Intrepid Cube models are missing tenant-scoped join coverage: ${snippet}`);
  }
}

if (failures.length > 0) {
  console.error('Intrepid tenant-safety verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Intrepid tenant-safety verification passed.');