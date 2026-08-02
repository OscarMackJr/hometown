import * as fs from 'fs/promises';
import * as path from 'path';
import { AnswerTrace, AnswerTraceSchema, IAnswerTraceWriter } from './trace.js';

export type AnswerTraceWriterMode = 'file' | 'postgres' | 'off';

export type AnswerTracePostgresRow = {
  trace_id: string;
  schema_version: string;
  created_at: string;
  origin_org: string;
  origin_system: string;
  app_id: string;
  user_id: string;
  tenant_id: string | null;
  feature_tag: string;
  query_hash: string;
  target_integration: string;
  primary_request_id: string;
  answer_hash: string;
  evidence_count: number;
  context_complete: boolean;
  degradation_mode: string;
  envelope: string;
};

export type PostgresQueryExecutor = {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
};

export type PostgresAnswerTraceWriterOptions = {
  schema?: string;
  table?: string;
};

export type AnswerTraceWriterConfig =
  | {
      mode: 'off';
    }
  | {
      mode: 'file';
      filePath: string;
    }
  | {
      mode: 'postgres';
      connectionString: string;
      schema?: string;
      table?: string;
    };

export type AnswerTraceWriterConfigOverrides = {
  mode?: AnswerTraceWriterMode;
  filePath?: string;
  connectionString?: string;
  schema?: string;
  table?: string;
};

export const DEFAULT_ANSWER_TRACE_FILE_PATH = path.join('tmp', 'answer-traces', 'default-answer-traces.jsonl');

export class FileAnswerTraceWriter implements IAnswerTraceWriter {
  public constructor(private readonly filePath: string) {}

  public async write(trace: AnswerTrace): Promise<void> {
    const parsed = AnswerTraceSchema.parse(trace);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(parsed)}\n`, 'utf8');
  }
}

export async function readJsonlTraces(filePath: string): Promise<AnswerTrace[]> {
  const content = await fs.readFile(filePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => AnswerTraceSchema.parse(JSON.parse(line)));
}

export class PostgresAnswerTraceWriter implements IAnswerTraceWriter {
  private readonly tableRef: string;

  public constructor(
    private readonly client: PostgresQueryExecutor,
    options: PostgresAnswerTraceWriterOptions = {}
  ) {
    const schema = options.schema ?? 'public';
    const table = options.table ?? 'answer_trace';
    this.tableRef = `${quotePgIdentifier(schema)}.${quotePgIdentifier(table)}`;
  }

  public async write(trace: AnswerTrace): Promise<void> {
    const row = answerTraceToPostgresRow(trace);
    const columns = postgresTraceColumns;
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const sql = `INSERT INTO ${this.tableRef} (${columns.map(quotePgIdentifier).join(', ')}) VALUES (${placeholders})`;
    const values = columns.map((column) => row[column]);

    await this.client.query(sql, values);
  }
}

export async function createAnswerTraceWriterFromConfig(
  config: AnswerTraceWriterConfig,
  postgresClient?: PostgresQueryExecutor
): Promise<IAnswerTraceWriter | undefined> {
  switch (config.mode) {
    case 'off':
      return undefined;
    case 'file':
      return new FileAnswerTraceWriter(config.filePath);
    case 'postgres':
      if (postgresClient) {
        return new PostgresAnswerTraceWriter(postgresClient, {
          schema: config.schema,
          table: config.table
        });
      }
      return createPostgresAnswerTraceWriterFromPg(
        { connectionString: config.connectionString },
        {
          schema: config.schema,
          table: config.table
        }
      );
  }
}

export async function createPostgresAnswerTraceWriterFromPg(
  config: Record<string, unknown>,
  options: PostgresAnswerTraceWriterOptions = {}
): Promise<PostgresAnswerTraceWriter> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<{ Pool: new (config: Record<string, unknown>) => PostgresQueryExecutor }>;
  const pg = await dynamicImport('pg');
  return new PostgresAnswerTraceWriter(new pg.Pool(config), options);
}

export function answerTraceToPostgresRow(trace: AnswerTrace): AnswerTracePostgresRow {
  const parsed = AnswerTraceSchema.parse(trace);
  return {
    trace_id: parsed.traceId,
    schema_version: parsed.schemaVersion,
    created_at: parsed.createdAt,
    origin_org: parsed.origin.org,
    origin_system: parsed.origin.system,
    app_id: parsed.principal.appId,
    user_id: parsed.principal.userId,
    tenant_id: parsed.principal.tenantId ?? null,
    feature_tag: parsed.principal.featureTag,
    query_hash: parsed.query.hash,
    target_integration: parsed.query.targetIntegrationId,
    primary_request_id: parsed.primaryRequestId,
    answer_hash: parsed.answer.hash,
    evidence_count: parsed.evidence.length,
    context_complete: parsed.retrieval.contextComplete,
    degradation_mode: parsed.retrieval.degradationMode,
    envelope: JSON.stringify(parsed)
  };
}

export function resolveAnswerTraceWriterConfig(
  overrides: AnswerTraceWriterConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): AnswerTraceWriterConfig {
  const mode = overrides.mode ?? normalizeWriterMode(env.ANSWER_TRACE_WRITER);

  if (mode === 'off') {
    return { mode: 'off' };
  }

  if (mode === 'postgres') {
    const connectionString = overrides.connectionString ?? env.TRACE_POSTGRES_URL;
    if (!connectionString) {
      throw new Error('TRACE_POSTGRES_URL is required when ANSWER_TRACE_WRITER=postgres.');
    }

    return {
      mode,
      connectionString,
      schema: overrides.schema ?? env.ANSWER_TRACE_POSTGRES_SCHEMA ?? 'public',
      table: overrides.table ?? env.ANSWER_TRACE_POSTGRES_TABLE ?? 'answer_trace'
    };
  }

  return {
    mode: 'file',
    filePath: path.resolve(cwd, overrides.filePath ?? env.ANSWER_TRACE_FILE_PATH ?? DEFAULT_ANSWER_TRACE_FILE_PATH)
  };
}

export async function createConfiguredAnswerTraceWriter(
  overrides: AnswerTraceWriterConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  postgresClient?: PostgresQueryExecutor
): Promise<IAnswerTraceWriter | undefined> {
  const config = resolveAnswerTraceWriterConfig(overrides, env, cwd);
  return createAnswerTraceWriterFromConfig(config, postgresClient);
}

export const postgresTraceColumns = [
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
] as const;

function normalizeWriterMode(value: string | undefined): AnswerTraceWriterMode {
  if (value === 'postgres' || value === 'off' || value === 'file') {
    return value;
  }
  return 'file';
}

function quotePgIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}
