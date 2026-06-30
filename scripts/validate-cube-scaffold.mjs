import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'cube/docker-compose.yml',
  'cube/docker-compose.intrepid-smoke.yml',
  'cube/docker-compose.intrepid-sandbox.yml',
  'cube/.env.example',
  'cube/model/enterprise_customer.yml',
  'cube/model/financial_ledger.yml',
  'cube/model/intrepid_loan_runs.yml',
  'cube/model/intrepid_loans.yml',
  'cube/model/intrepid_loan_exceptions.yml',
  'cube/model/intrepid_portfolio_exceptions.yml',
  'cube/smoke/intrepid-postgres/init/001_schema.sql',
  'scripts/cube-intrepid-sandbox-query.mjs',
  'scripts/verify-intrepid-cube-adapter.mjs',
  'scripts/run-factory-intrepid-cube.mjs',
  'specs/WHY_CUBE_SEMANTIC_LAYER.md',
  'cube/README.md'
];

const failures = [];

function readRequired(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function requireIncludes(label, content, snippets) {
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      failures.push(`${label} is missing required content: ${snippet}`);
    }
  }
}

for (const file of requiredFiles) {
  readRequired(file);
}

const envExample = readRequired('cube/.env.example');
const envLines = envExample
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const requiredEnvVars = [
  'AWS_POSTGRES_CRM_URL',
  'AZURE_SQL_LEDGER_URL',
  'CUBEJS_API_SECRET',
  'INTREPID_POSTGRES_URL',
  'INTREPID_POSTGRES_HOST',
  'INTREPID_POSTGRES_PORT',
  'INTREPID_POSTGRES_DB',
  'INTREPID_POSTGRES_USER',
  'INTREPID_POSTGRES_PASSWORD',
  'INTREPID_CUBE_SCHEMA',
  'INTREPID_TENANT_ID',
  'INTREPID_INTEGRATION_MODE'
];

for (const envVar of requiredEnvVars) {
  const expected = `${envVar}=`;
  if (!envLines.includes(expected)) {
    failures.push(`cube/.env.example must contain a blank placeholder: ${expected}`);
  }
}

for (const line of envLines) {
  const [key, ...valueParts] = line.split('=');
  const value = valueParts.join('=').trim();
  if (requiredEnvVars.includes(key) && value.length > 0) {
    failures.push(`cube/.env.example must not commit a value for ${key}`);
  }
}

const compose = readRequired('cube/docker-compose.yml');
requireIncludes('cube/docker-compose.yml', compose, [
  'cubejs/cube',
  '4000:4000',
  '15432:15432',
  'CUBEJS_API_SECRET',
  'AWS_POSTGRES_CRM_URL'
]);

const smokeCompose = readRequired('cube/docker-compose.intrepid-smoke.yml');
requireIncludes('cube/docker-compose.intrepid-smoke.yml', smokeCompose, [
  'postgres:16-alpine',
  'cubejs/cube',
  'intrepid_smoke',
  'intrepid-smoke-secret',
  'INTREPID_POSTGRES_URL',
  'INTREPID_TENANT_ID'
]);

const smokeSeed = readRequired('cube/smoke/intrepid-postgres/init/001_schema.sql');
requireIncludes('Intrepid smoke seed SQL', smokeSeed, [
  'CREATE TABLE public.loan_run',
  'CREATE TABLE public.loan_fact',
  'CREATE TABLE public.loan_exceptions',
  'CREATE TABLE public.portfolio_exceptions',
  'INTREPID_RUN_2026_Q2_001'
]);

const sandboxCompose = readRequired('cube/docker-compose.intrepid-sandbox.yml');
requireIncludes('cube/docker-compose.intrepid-sandbox.yml', sandboxCompose, [
  'cubejs/cube',
  'CUBEJS_DB_HOST: ${INTREPID_POSTGRES_HOST}',
  'CUBEJS_DB_NAME: ${INTREPID_POSTGRES_DB}',
  'CUBEJS_DB_USER: ${INTREPID_POSTGRES_USER}',
  'CUBEJS_DB_PASS: ${INTREPID_POSTGRES_PASSWORD}',
  'CUBEJS_DB_URL: ${INTREPID_POSTGRES_URL}',
  'deploy_default',
  'INTREPID_CUBE_SCHEMA: ${INTREPID_CUBE_SCHEMA:-public}',
  'INTREPID_TENANT_ID: ${INTREPID_TENANT_ID}'
]);

const querySandbox = readRequired('scripts/cube-intrepid-sandbox-query.mjs');
requireIncludes('scripts/cube-intrepid-sandbox-query.mjs', querySandbox, [
  'INTREPID_TENANT_ID',
  'INTREPID_SANDBOX_RUN_ID',
  'intrepid_loan_runs.count',
  'intrepid_loan_runs.tenant_id'
]);

const factoryCubeMode = readRequired('scripts/run-factory-intrepid-cube.mjs');
requireIncludes('scripts/run-factory-intrepid-cube.mjs', factoryCubeMode, [
  'INTREPID_INTEGRATION_MODE',
  'cube',
  'factory-evaluation-rig'
]);
const verifyCubeAdapter = readRequired('scripts/verify-intrepid-cube-adapter.mjs');
requireIncludes('scripts/verify-intrepid-cube-adapter.mjs', verifyCubeAdapter, [
  'INTREPID_INTEGRATION_MODE',
  'cube',
  'fetchContext'
]);

const whyCube = readRequired('specs/WHY_CUBE_SEMANTIC_LAYER.md');
requireIncludes('specs/WHY_CUBE_SEMANTIC_LAYER.md', whyCube, [
  'Cube is the semantic layer',
  'governed business API',
  'GraphRAG'
]);

const enterpriseCustomer = readRequired('cube/model/enterprise_customer.yml');
requireIncludes('enterprise_customer model', enterpriseCustomer, [
  'cubes:',
  'name: enterprise_customer',
  'sql_table: public.customers',
  'name: financial_ledger_account',
  'relationship: one_to_many',
  'customer_id',
  'lifetime_value'
]);

const financialLedger = readRequired('cube/model/financial_ledger.yml');
requireIncludes('financial_ledger model', financialLedger, [
  'cubes:',
  'name: financial_ledger_account',
  'sql_table: dbo.ledger_accounts',
  'name: enterprise_customer',
  'relationship: many_to_one',
  'customer_id',
  'current_balance',
  'Azure_SQL_Ledger_Cluster'
]);

const intrepidLoanRuns = readRequired('cube/model/intrepid_loan_runs.yml');
requireIncludes('intrepid_loan_runs model', intrepidLoanRuns, [
  'name: intrepid_loan_runs',
  'sql_table: public.loan_run',
  'tenant_id',
  'run_id',
  'name: intrepid_loans',
  'name: intrepid_loan_exceptions',
  'name: intrepid_portfolio_exceptions'
]);

const intrepidLoans = readRequired('cube/model/intrepid_loans.yml');
requireIncludes('intrepid_loans model', intrepidLoans, [
  'name: intrepid_loans',
  'sql_table: public.loan_fact',
  'tenant_id',
  'run_id',
  'seller_loan_no',
  'name: intrepid_loan_runs',
  'name: intrepid_loan_exceptions'
]);

const intrepidLoanExceptions = readRequired('cube/model/intrepid_loan_exceptions.yml');
requireIncludes('intrepid_loan_exceptions model', intrepidLoanExceptions, [
  'name: intrepid_loan_exceptions',
  'sql_table: public.loan_exceptions',
  'tenant_id',
  'run_id',
  'seller_loan_no',
  'rule_id',
  'exception_type',
  'balance_impact'
]);

const intrepidPortfolioExceptions = readRequired('cube/model/intrepid_portfolio_exceptions.yml');
requireIncludes('intrepid_portfolio_exceptions model', intrepidPortfolioExceptions, [
  'name: intrepid_portfolio_exceptions',
  'sql_table: public.portfolio_exceptions',
  'tenant_id',
  'run_id',
  'rule_id',
  'exception_type',
  'balance_impact'
]);

for (const file of [
  'cube/docker-compose.yml',
  'cube/docker-compose.intrepid-smoke.yml',
  'cube/docker-compose.intrepid-sandbox.yml',
  'cube/model/enterprise_customer.yml',
  'cube/model/financial_ledger.yml',
  'cube/model/intrepid_loan_runs.yml',
  'cube/model/intrepid_loans.yml',
  'cube/model/intrepid_loan_exceptions.yml',
  'cube/model/intrepid_portfolio_exceptions.yml',
  'cube/smoke/intrepid-postgres/init/001_schema.sql'
]) {
  const content = readRequired(file);
  if (content.includes('\t')) {
    failures.push(`${file} must use spaces, not tabs`);
  }
}

if (failures.length > 0) {
  console.error('Cube scaffold validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Cube scaffold validation passed.');

