import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), 'cube', '.env');
const verifyMode = process.argv.includes('--docker') ? 'docker' : 'psql';
const requiredEnvVarsByMode = {
  psql: [
    'INTREPID_POSTGRES_HOST',
    'INTREPID_POSTGRES_PORT',
    'INTREPID_POSTGRES_DB',
    'INTREPID_POSTGRES_USER',
    'INTREPID_POSTGRES_PASSWORD',
    'INTREPID_CUBE_SCHEMA',
    'INTREPID_TENANT_ID',
    'INTREPID_SANDBOX_VERIFY'
  ],
  docker: [
    'INTREPID_POSTGRES_DB',
    'INTREPID_POSTGRES_USER',
    'INTREPID_POSTGRES_PASSWORD',
    'INTREPID_CUBE_SCHEMA',
    'INTREPID_TENANT_ID',
    'INTREPID_SANDBOX_VERIFY'
  ]
};

const expectedSchema = {
  loan_run: [
    'tenant_id',
    'run_id',
    'as_of_date',
    'portfolio',
    'irr_target',
    'status',
    'created_at',
    'updated_at',
    'started_at',
    'completed_at'
  ],
  loan_fact: [
    'tenant_id',
    'run_id',
    'seller_loan_no',
    'original_balance',
    'current_balance',
    'purchase_price',
    'price_pct',
    'has_exceptions',
    'status',
    'created_at'
  ],
  loan_exceptions: [
    'exception_id',
    'tenant_id',
    'run_id',
    'seller_loan_no',
    'rule_id',
    'exception_type',
    'severity',
    'message',
    'metric_name',
    'expected_value',
    'actual_value',
    'difference',
    'balance_impact',
    'original_balance',
    'purchase_price',
    'created_at'
  ],
  portfolio_exceptions: [
    'exception_id',
    'tenant_id',
    'run_id',
    'rule_id',
    'exception_type',
    'platform',
    'expected_value',
    'actual_value',
    'difference',
    'balance_impact',
    'severity',
    'created_at'
  ]
};

function loadLocalEnv() {
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

function assertRequiredEnv() {
  const missing = requiredEnvVarsByMode[verifyMode].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required sandbox mapping env var(s): ${missing.join(', ')}`);
  }

  if (process.env.INTREPID_SANDBOX_VERIFY !== 'non-production') {
    throw new Error('Refusing to connect. Set INTREPID_SANDBOX_VERIFY=non-production in cube/.env for sandbox verification.');
  }

  if (verifyMode === 'psql' && !/^\d+$/.test(process.env.INTREPID_POSTGRES_PORT ?? '')) {
    throw new Error('INTREPID_POSTGRES_PORT must be numeric.');
  }

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(process.env.INTREPID_CUBE_SCHEMA ?? '')) {
    throw new Error('INTREPID_CUBE_SCHEMA must be a simple PostgreSQL identifier.');
  }
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildMetadataSql() {
  const tableList = Object.keys(expectedSchema).map(sqlLiteral).join(', ');
  return `
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = ${sqlLiteral(process.env.INTREPID_CUBE_SCHEMA)}
  AND table_name IN (${tableList})
ORDER BY table_name, ordinal_position;
`.trim();
}

function fetchColumnMetadata() {
  const sql = buildMetadataSql();
  const result = verifyMode === 'docker' ? runDockerPsql(sql) : runLocalPsql(sql);

  if (result.status !== 0) {
    throw new Error(`Sandbox metadata query failed. ${result.context} exit ${result.status}: ${result.stderr.trim()}`);
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [tableName, columnName, dataType, isNullable] = line.split('\t');
      return { tableName, columnName, dataType, isNullable };
    });
}

function runLocalPsql(sql) {
  const result = spawnSync('psql', [
    '--host', process.env.INTREPID_POSTGRES_HOST,
    '--port', process.env.INTREPID_POSTGRES_PORT,
    '--dbname', process.env.INTREPID_POSTGRES_DB,
    '--username', process.env.INTREPID_POSTGRES_USER,
    '--no-password',
    '--set', 'ON_ERROR_STOP=1',
    '--tuples-only',
    '--no-align',
    '--field-separator', '\t',
    '--command', sql
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PGPASSWORD: process.env.INTREPID_POSTGRES_PASSWORD
    }
  });

  if (result.error?.code === 'ENOENT') {
    throw new Error('psql was not found. Install PostgreSQL client tools or run this script from an environment that has psql on PATH.');
  }

  return { ...result, context: 'psql' };
}

function runDockerPsql(sql) {
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
  ], {
    encoding: 'utf8'
  });

  if (result.error?.code === 'ENOENT') {
    throw new Error('docker was not found. Start Docker Desktop or run the non-Docker verifier from an environment with psql on PATH.');
  }

  return { ...result, context: `docker exec ${containerName} psql` };
}

function validateMetadata(rows) {
  const byTable = new Map();
  for (const row of rows) {
    if (!byTable.has(row.tableName)) byTable.set(row.tableName, []);
    byTable.get(row.tableName).push(row);
  }

  const failures = [];
  for (const [tableName, requiredColumns] of Object.entries(expectedSchema)) {
    const tableRows = byTable.get(tableName) ?? [];
    if (tableRows.length === 0) {
      failures.push(`Missing table: ${process.env.INTREPID_CUBE_SCHEMA}.${tableName}`);
      continue;
    }

    const actualColumns = new Set(tableRows.map((row) => row.columnName));
    for (const column of requiredColumns) {
      if (!actualColumns.has(column)) {
        failures.push(`Missing column: ${process.env.INTREPID_CUBE_SCHEMA}.${tableName}.${column}`);
      }
    }
  }

  return { byTable, failures };
}

function printMetadata(byTable) {
  console.log(`Intrepid sandbox schema metadata (${verifyMode} mode):`);
  for (const tableName of Object.keys(expectedSchema)) {
    const rows = byTable.get(tableName) ?? [];
    console.log(`\n${process.env.INTREPID_CUBE_SCHEMA}.${tableName}`);
    for (const row of rows) {
      console.log(`- ${row.columnName}: ${row.dataType}, nullable=${row.isNullable}`);
    }
  }
}

try {
  loadLocalEnv();
  assertRequiredEnv();
  const rows = fetchColumnMetadata();
  const { byTable, failures } = validateMetadata(rows);
  printMetadata(byTable);

  if (failures.length > 0) {
    console.error('\nIntrepid sandbox mapping verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('\nIntrepid sandbox mapping verification passed.');
} catch (error) {
  console.error('Intrepid sandbox mapping verification failed before completion.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}