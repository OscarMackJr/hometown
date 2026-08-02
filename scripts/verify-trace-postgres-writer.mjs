import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DarkFactoryEngine } from '../dist/core/factory.js';
import {
  DEFAULT_ANSWER_TRACE_FILE_PATH,
  PostgresAnswerTraceWriter,
  answerTraceToPostgresRow,
  createConfiguredAnswerTraceWriter,
  postgresTraceColumns,
  resolveAnswerTraceWriterConfig
} from '../dist/core/trace-writer.js';
import { AnswerTraceSchema, ATE_SCHEMA_VERSION } from '../dist/core/trace.js';

const root = process.cwd();
const failures = [];
const liveMode = process.argv.includes('--live') || process.env.TRACE_POSTGRES_VERIFY === 'live';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function makeRecord(entityId) {
  return {
    entityId,
    entityName: `Customer ${entityId}`,
    attributes: {
      tenantId: 'tenant-1',
      status: 'active'
    },
    relationships: []
  };
}

function baseTrace() {
  return {
    traceId: '33333333-3333-4333-8333-333333333333',
    schemaVersion: ATE_SCHEMA_VERSION,
    createdAt: '2026-08-01T20:00:00.000Z',
    origin: {
      org: 'twg',
      system: 'hometown-ekg'
    },
    principal: {
      appId: 'postgres-writer-verifier',
      userId: 'user-1',
      tenantId: 'tenant-1',
      featureTag: 'trace-postgres-writer-verifier'
    },
    query: {
      hash: hashA,
      targetIntegrationId: 'enterprise_crm_slice',
      targetEntityId: 'cust-1'
    },
    retrieval: {
      attempted: [
        {
          source: 'enterprise_crm_slice',
          status: 'ok',
          latencyMs: 17
        }
      ],
      degradationMode: 'degrade_with_disclosure',
      contextComplete: false
    },
    evidence: [
      {
        integrationId: 'enterprise_crm_slice',
        entityId: 'cust-1',
        entityName: 'Customer One',
        recordHash: hashB,
        asOf: '2026-08-01T19:59:00.000Z',
        validation: 'passed',
        tenantId: 'tenant-1',
        retrieval: {
          method: 'integration',
          cubeQueryHash: hashC
        }
      }
    ],
    promptEnvelope: {
      templateId: 'postgres-writer-verifier',
      templateVersion: '0.1.0',
      sections: [
        {
          name: 'evidence',
          evidenceRefs: [0],
          tokenCount: 24
        }
      ],
      totalPromptTokens: 24
    },
    modelCalls: [
      {
        requestId: 'ledger-request-postgres-writer',
        role: 'final_answer'
      }
    ],
    primaryRequestId: 'ledger-request-postgres-writer',
    answer: {
      hash: hashA,
      finishReason: 'stop'
    },
    policy: {},
    signature: {
      alg: 'test-only',
      keyId: 'test-key',
      value: 'test-signature-placeholder'
    }
  };
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function quotePgIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function loadPgModule() {
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    return await dynamicImport('pg');
  } catch (error) {
    failures.push(`Live mode requires the 'pg' package available at runtime: ${error instanceof Error ? error.message : 'unknown_import_error'}`);
    return undefined;
  }
}

function assertStaticContract() {
  const trace = AnswerTraceSchema.parse(baseTrace());
  const row = answerTraceToPostgresRow(trace);
  const expectedColumns = [
    'trace_id',
    'schema_version',
    'created_at',
    'origin_org',
    'origin_system',
    'app_id',
    'user_id',
    'tenant_id',
    'feature_tag',
    'query_hash',
    'target_integration',
    'primary_request_id',
    'answer_hash',
    'evidence_count',
    'context_complete',
    'degradation_mode',
    'envelope'
  ];

  assert(JSON.stringify(postgresTraceColumns) === JSON.stringify(expectedColumns), 'Postgres writer columns must match answer_trace DDL columns exactly.');
  assert(row.trace_id === trace.traceId, 'trace_id should map from trace.traceId');
  assert(row.schema_version === 'ate/0.2', 'schema_version should map from ATE v0.2 schemaVersion');
  assert(row.created_at === trace.createdAt, 'created_at should map from trace.createdAt');
  assert(row.origin_org === trace.origin.org, 'origin_org should map from origin.org');
  assert(row.origin_system === trace.origin.system, 'origin_system should map from origin.system');
  assert(row.app_id === trace.principal.appId, 'app_id should map from principal.appId');
  assert(row.user_id === trace.principal.userId, 'user_id should map from principal.userId');
  assert(row.tenant_id === trace.principal.tenantId, 'tenant_id should map from principal.tenantId');
  assert(row.feature_tag === trace.principal.featureTag, 'feature_tag should map from principal.featureTag');
  assert(row.query_hash === trace.query.hash, 'query_hash should map from query.hash');
  assert(row.target_integration === trace.query.targetIntegrationId, 'target_integration should map from query.targetIntegrationId');
  assert(row.primary_request_id === trace.primaryRequestId, 'primary_request_id should remain the ledger request_id join key');
  assert(row.answer_hash === trace.answer.hash, 'answer_hash should map from answer.hash only');
  assert(row.evidence_count === trace.evidence.length, 'evidence_count should be derived from evidence length');
  assert(row.context_complete === trace.retrieval.contextComplete, 'context_complete should map from retrieval.contextComplete');
  assert(row.degradation_mode === trace.retrieval.degradationMode, 'degradation_mode should map from retrieval.degradationMode');

  const envelope = AnswerTraceSchema.parse(JSON.parse(row.envelope));
  assert(stableJson(envelope) === stableJson(trace), 'envelope should store the canonical full ATE v0.2 trace');

  const defaultConfig = resolveAnswerTraceWriterConfig({}, {});
  assert(defaultConfig.mode === 'file', 'default configured trace writer mode should be file for CI/local use');
  if (defaultConfig.mode === 'file') {
    assert(defaultConfig.filePath.endsWith(DEFAULT_ANSWER_TRACE_FILE_PATH.replaceAll('\\', path.sep)), 'default configured file writer path should use the standard local JSONL location');
  }

  const explicitOff = resolveAnswerTraceWriterConfig({ mode: 'off' }, {});
  assert(explicitOff.mode === 'off', 'explicit off mode should disable trace writes');

  const explicitPostgres = resolveAnswerTraceWriterConfig(
    { mode: 'postgres' },
    {
      TRACE_POSTGRES_URL: 'postgresql://trace_user:trace_pass@localhost:5432/hometown_trace',
      ANSWER_TRACE_POSTGRES_SCHEMA: 'public',
      ANSWER_TRACE_POSTGRES_TABLE: 'answer_trace'
    }
  );
  assert(explicitPostgres.mode === 'postgres', 'explicit postgres mode should resolve postgres writer configuration');
  if (explicitPostgres.mode === 'postgres') {
    assert(explicitPostgres.connectionString.includes('hometown_trace'), 'postgres writer should resolve TRACE_POSTGRES_URL');
    assert(explicitPostgres.schema === 'public', 'postgres writer should resolve schema override');
    assert(explicitPostgres.table === 'answer_trace', 'postgres writer should resolve table override');
  }

  const forbiddenLedgerColumns = ['model', 'provider', 'total_tokens', 'prompt_tokens', 'completion_tokens', 'cost_usd', 'latency_ms'];
  for (const column of forbiddenLedgerColumns) {
    assert(!postgresTraceColumns.includes(column), `Postgres writer must not copy ledger-owned column ${column}`);
    assert(!(column in row), `Postgres row must not include ledger-owned field ${column}`);
  }

  const ddl = read('sql/answer_trace_ddl.sql');
  assert(ddl.includes('GRANT INSERT ON answer_trace TO hometown_trace_writer'), 'DDL must document INSERT-only writer grant.');
  assert(!/GRANT\s+(UPDATE|DELETE|ALL)/i.test(ddl), 'DDL must not grant UPDATE, DELETE, or ALL on answer_trace.');
}

async function assertWriterQueryContract() {
  const trace = AnswerTraceSchema.parse(baseTrace());
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rowCount: 1 };
    }
  };

  const writer = new PostgresAnswerTraceWriter(client);
  await writer.write(trace);

  assert(calls.length === 1, `expected one INSERT query, got ${calls.length}`);
  const call = calls[0];
  assert(call.sql.startsWith('INSERT INTO "public"."answer_trace"'), 'writer should insert into public.answer_trace by default.');
  assert(!/\b(UPDATE|DELETE|UPSERT|MERGE)\b/i.test(call.sql), 'writer SQL must be insert-only.');
  for (const column of postgresTraceColumns) {
    assert(call.sql.includes(`"${column}"`), `writer SQL missing quoted column ${column}`);
  }
  assert(call.values.length === postgresTraceColumns.length, 'writer parameter count should match column count.');
  const row = answerTraceToPostgresRow(trace);
  for (const [index, column] of postgresTraceColumns.entries()) {
    assert(call.values[index] === row[column], `writer parameter ${index + 1} should map ${column}`);
  }
}

async function assertLiveAnswerPath() {
  if (!process.env.TRACE_POSTGRES_URL) {
    failures.push('Live mode requires TRACE_POSTGRES_URL for a non-production Postgres database with sql/answer_trace_ddl.sql applied.');
    return;
  }

  const pg = await loadPgModule();
  if (!pg) return;

  const config = resolveAnswerTraceWriterConfig(
    { mode: 'postgres' },
    {
      ...process.env,
      ANSWER_TRACE_WRITER: 'postgres'
    }
  );
  if (config.mode !== 'postgres') {
    failures.push('Live mode should resolve a postgres trace-writer configuration.');
    return;
  }

  const pool = new pg.Pool({ connectionString: config.connectionString });
  try {
    const factory = new DarkFactoryEngine();
    factory.registerIntegration({
      integrationId: 'enterprise_crm_slice',
      supportedEntities: ['Customer'],
      async fetchContext(entityId) {
        return makeRecord(entityId);
      }
    });

    const primaryRequestId = `live-postgres-answer-${Date.now()}`;
    const answer = await factory.answerWithConfiguredTrace('enterprise_crm_slice', 'cust-live-1', {
      featureTag: 'internal_summary_partial_allowed',
      entityType: 'Customer',
      questionText: 'What is the customer status?',
      appId: 'trace-postgres-live-verifier',
      userId: 'user-1',
      tenantId: 'tenant-1',
      primaryRequestId,
      traceWriterConfig: {
        mode: 'postgres'
      },
      traceWriterEnv: {
        ...process.env,
        ANSWER_TRACE_WRITER: 'postgres',
        TRACE_POSTGRES_URL: config.connectionString,
        ANSWER_TRACE_POSTGRES_SCHEMA: config.schema,
        ANSWER_TRACE_POSTGRES_TABLE: config.table
      }
    });

    assert(answer.traceWrite.attempted, 'configured answer path should attempt a trace write');
    assert(answer.traceWrite.succeeded, 'configured answer path should succeed when Postgres is reachable');

    const tableRef = `${quotePgIdentifier(config.schema ?? 'public')}.${quotePgIdentifier(config.table ?? 'answer_trace')}`;
    const selectResult = await pool.query(
      `SELECT trace_id::text AS trace_id, primary_request_id, answer_hash, evidence_count, context_complete, degradation_mode, envelope::text AS envelope FROM ${tableRef} WHERE trace_id = $1`,
      [answer.trace.traceId]
    );

    assert(selectResult.rowCount === 1, `expected one stored answer_trace row for ${answer.trace.traceId}`);
    const row = selectResult.rows[0];
    if (!row) {
      return;
    }

    assert(row.trace_id === answer.trace.traceId, 'stored row should preserve trace_id');
    assert(row.primary_request_id === answer.trace.primaryRequestId, 'stored row should preserve primary_request_id');
    assert(row.answer_hash === answer.trace.answer.hash, 'stored row should preserve answer_hash');
    assert(row.evidence_count === answer.trace.evidence.length, 'stored row should preserve evidence_count');
    assert(row.context_complete === answer.trace.retrieval.contextComplete, 'stored row should preserve context_complete');
    assert(row.degradation_mode === answer.trace.retrieval.degradationMode, 'stored row should preserve degradation_mode');

    const storedEnvelope = AnswerTraceSchema.parse(JSON.parse(row.envelope));
    assert(stableJson(storedEnvelope) === stableJson(answer.trace), 'stored envelope jsonb should round-trip the full ATE v0.2 trace');

    const columnResult = await pool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
      [config.schema ?? 'public', config.table ?? 'answer_trace']
    );
    const columns = new Set(columnResult.rows.map((resultRow) => resultRow.column_name));
    for (const forbidden of ['model', 'provider', 'tokens', 'cost', 'latency']) {
      assert(!columns.has(forbidden), `answer_trace table should not copy ledger-owned column ${forbidden}`);
    }
  } finally {
    await pool.end();
  }
}

await assertWriterQueryContract();
assertStaticContract();
if (liveMode) await assertLiveAnswerPath();

if (failures.length > 0) {
  console.error('Postgres trace writer verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const mode = liveMode ? 'static contract and live answer-path insert' : 'static contract';
console.log(`Postgres trace writer verification passed (${mode}).`);
