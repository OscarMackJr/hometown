import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, 'cube', '.env');
const failures = [];
const tenantOne = '11111111-1111-4111-8111-111111111111';
const tenantTwo = '22222222-2222-4222-8222-222222222222';
const tenantScopedTables = ['loan_run', 'loan_fact', 'loan_exceptions', 'portfolio_exceptions'];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireIncludes(label, content, snippets) {
  for (const snippet of snippets) {
    if (!content.includes(snippet)) failures.push(`${label} is missing tenant-safety invariant: ${snippet}`);
  }
}

function loadLocalEnv() {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return value;
}

function runDockerPsql(sql) {
  const required = ['INTREPID_POSTGRES_DB', 'INTREPID_POSTGRES_USER', 'INTREPID_POSTGRES_PASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Missing required tenant-safety env var(s): ${missing.join(', ')}. Set them in cube/.env.`);
  if (process.env.INTREPID_SANDBOX_VERIFY !== 'non-production') {
    throw new Error('Refusing DB-backed tenant verification. Set INTREPID_SANDBOX_VERIFY=non-production in cube/.env.');
  }

  const containerName = process.env.INTREPID_POSTGRES_CONTAINER || 'deploy-postgres-1';
  const result = spawnSync('docker', [
    'exec',
    '-e',
    `PGPASSWORD=${process.env.INTREPID_POSTGRES_PASSWORD}`,
    containerName,
    'psql',
    '--dbname', process.env.INTREPID_POSTGRES_DB,
    '--username', process.env.INTREPID_POSTGRES_USER,
    '--no-password',
    '--set', 'ON_ERROR_STOP=1',
    '--tuples-only',
    '--no-align',
    '--field-separator', '\t',
    '--command', sql
  ], { encoding: 'utf8' });

  if (result.error?.code === 'ENOENT') throw new Error('docker was not found. Start Docker Desktop or run in an environment with Docker on PATH.');
  if (result.status !== 0) throw new Error(`docker exec ${containerName} psql exit ${result.status}: ${result.stderr.trim()}`);

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== 'SET' && line !== tenantOne && line !== tenantTwo);
}

function verifyStaticLayerOne() {
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
    { label: 'intrepid_loan_runs model', path: 'cube/model/intrepid_loan_runs.yml', snippets: ['name: tenant_id', '{CUBE}.tenant_id = {intrepid_loans}.tenant_id', '{CUBE}.tenant_id = {intrepid_loan_exceptions}.tenant_id', '{CUBE}.tenant_id = {intrepid_portfolio_exceptions}.tenant_id'] },
    { label: 'intrepid_loans model', path: 'cube/model/intrepid_loans.yml', snippets: ['name: tenant_id', '{CUBE}.tenant_id = {intrepid_loan_runs}.tenant_id', '{CUBE}.tenant_id = {intrepid_loan_exceptions}.tenant_id'] },
    { label: 'intrepid_loan_exceptions model', path: 'cube/model/intrepid_loan_exceptions.yml', snippets: ['name: tenant_id', '{CUBE}.tenant_id = {intrepid_loan_runs}.tenant_id', '{CUBE}.tenant_id = {intrepid_loans}.tenant_id'] },
    { label: 'intrepid_portfolio_exceptions model', path: 'cube/model/intrepid_portfolio_exceptions.yml', snippets: ['name: tenant_id', '{CUBE}.tenant_id = {intrepid_loan_runs}.tenant_id'] }
  ];

  for (const check of modelChecks) requireIncludes(check.label, read(check.path), check.snippets);
  const combinedModels = modelChecks.map((check) => read(check.path)).join('\n');
  for (const snippet of tenantScopedJoinSnippets) {
    if (!combinedModels.includes(snippet)) failures.push(`Intrepid Cube models are missing tenant-scoped join coverage: ${snippet}`);
  }
}

function verifyRlsSourceContract() {
  const smokeSql = read('cube/smoke/intrepid-postgres/init/001_schema.sql');
  const migrationSql = read('sql/intrepid_tenant_rls.sql');
  for (const [label, content] of [
    ['Intrepid smoke RLS seed SQL', smokeSql],
    ['Intrepid tenant RLS migration SQL', migrationSql]
  ]) {
    requireIncludes(label, content, [
      tenantTwo,
      'CREATE ROLE ekg_cube_reader LOGIN',
      "current_setting('app.current_tenant_id', true)",
      'ENABLE ROW LEVEL SECURITY',
      'FORCE ROW LEVEL SECURITY'
    ]);
    for (const table of tenantScopedTables) {
      requireIncludes(`${label} for ${table}`, content, [
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`,
        `ON public.${table}`,
        `GRANT SELECT ON public.${table} TO ekg_cube_reader`
      ]);
    }
  }
}

function buildTenantCountSql(schema, tenantId) {
  const selects = tenantScopedTables.map((table) => {
    return `SELECT ${sqlLiteral(table)} AS table_name, count(*)::int AS total_rows, count(*) FILTER (WHERE tenant_id::text <> ${sqlLiteral(tenantId)})::int AS other_tenant_rows, count(DISTINCT tenant_id)::int AS tenant_count FROM ${schema}.${table}`;
  });
  return `SET ROLE ekg_cube_reader;\nSELECT set_config('app.current_tenant_id', ${sqlLiteral(tenantId)}, false);\n${selects.join('\nUNION ALL\n')}\nORDER BY table_name;`;
}

function buildFailClosedSql(schema) {
  const selects = tenantScopedTables.map((table) => `SELECT ${sqlLiteral(table)} AS table_name, count(*)::int AS visible_rows FROM ${schema}.${table}`);
  return `SET ROLE ekg_cube_reader;\n${selects.join('\nUNION ALL\n')}\nORDER BY table_name;`;
}

function buildGrantSql(schema) {
  const tableList = tenantScopedTables.map(sqlLiteral).join(', ');
  return `SELECT c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text, pg_get_userbyid(c.relowner) AS owner_name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ${sqlLiteral(schema)} AND c.relname IN (${tableList}) ORDER BY c.relname;\nSELECT rolname, rolsuper::text, rolbypassrls::text FROM pg_roles WHERE rolname = 'ekg_cube_reader';`;
}

function verifyTenantRows(label, rows) {
  const seen = new Set();
  for (const row of rows) {
    const [tableName, totalRows, otherTenantRows, tenantCount] = row.split('\t');
    seen.add(tableName);
    if (Number(totalRows) <= 0) failures.push(`${label}: ${tableName} should expose tenant-owned rows, got ${totalRows}`);
    if (Number(otherTenantRows) !== 0) failures.push(`${label}: ${tableName} exposed ${otherTenantRows} other-tenant row(s)`);
    if (Number(tenantCount) !== 1) failures.push(`${label}: ${tableName} should expose exactly one tenant, got ${tenantCount}`);
  }
  for (const table of tenantScopedTables) if (!seen.has(table)) failures.push(`${label}: missing tenant result row for ${table}`);
}

function verifyFailClosedRows(rows) {
  const seen = new Set();
  for (const row of rows) {
    const [tableName, visibleRows] = row.split('\t');
    seen.add(tableName);
    if (Number(visibleRows) !== 0) failures.push(`fail-closed: ${tableName} exposed ${visibleRows} row(s) without app.current_tenant_id`);
  }
  for (const table of tenantScopedTables) if (!seen.has(table)) failures.push(`fail-closed: missing result row for ${table}`);
}

function verifyGrantRows(rows) {
  const tableRows = rows.filter((row) => tenantScopedTables.includes(row.split('\t')[0]));
  const roleRows = rows.filter((row) => row.startsWith('ekg_cube_reader\t'));
  for (const row of tableRows) {
    const [tableName, rowSecurity, forceRowSecurity, ownerName] = row.split('\t');
    if (rowSecurity !== 'true') failures.push(`grant/RLS: ${tableName} does not have RLS enabled`);
    if (forceRowSecurity !== 'true') failures.push(`grant/RLS: ${tableName} does not FORCE ROW LEVEL SECURITY`);
    if (ownerName === 'ekg_cube_reader') failures.push(`grant/RLS: ekg_cube_reader owns ${tableName}`);
  }
  if (tableRows.length !== tenantScopedTables.length) failures.push(`grant/RLS: expected ${tenantScopedTables.length} tenant-scoped table assertions, got ${tableRows.length}`);
  if (roleRows.length !== 1) {
    failures.push('grant/RLS: ekg_cube_reader role is missing');
    return;
  }
  const [, isSuperuser, bypassRls] = roleRows[0].split('\t');
  if (isSuperuser !== 'false') failures.push('grant/RLS: ekg_cube_reader must not be superuser');
  if (bypassRls !== 'false') failures.push('grant/RLS: ekg_cube_reader must not have BYPASSRLS');
}

function verifyDatabaseLayer() {
  loadLocalEnv();
  const schema = sqlIdentifier(process.env.INTREPID_CUBE_SCHEMA || 'public');
  verifyGrantRows(runDockerPsql(buildGrantSql(schema)));
  verifyTenantRows(`positive tenant ${tenantOne}`, runDockerPsql(buildTenantCountSql(schema, tenantOne)));
  verifyTenantRows(`positive tenant ${tenantTwo}`, runDockerPsql(buildTenantCountSql(schema, tenantTwo)));
  verifyFailClosedRows(runDockerPsql(buildFailClosedSql(schema)));
}

try {
  verifyStaticLayerOne();
  verifyRlsSourceContract();
  verifyDatabaseLayer();
  if (failures.length > 0) {
    console.error('Intrepid tenant-safety verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Intrepid tenant-safety verification passed. Cube tenant filters and PostgreSQL forced RLS both protect tenant-scoped Intrepid tables.');
} catch (error) {
  console.error('Intrepid tenant-safety verification failed before completion.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}