import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'cube/docker-compose.yml',
  'cube/.env.example',
  'cube/model/enterprise_customer.yml',
  'cube/model/financial_ledger.yml',
  'cube/model/intrepid_loan_runs.yml',
  'cube/model/intrepid_loans.yml',
  'cube/model/intrepid_loan_exceptions.yml',
  'cube/model/intrepid_portfolio_exceptions.yml',
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
  'CUBEJS_API_SECRET'
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
  'cube/model/enterprise_customer.yml',
  'cube/model/financial_ledger.yml',
  'cube/model/intrepid_loan_runs.yml',
  'cube/model/intrepid_loans.yml',
  'cube/model/intrepid_loan_exceptions.yml',
  'cube/model/intrepid_portfolio_exceptions.yml'
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
