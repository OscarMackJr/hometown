import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DarkFactoryEngine } from '../dist/core/factory.js';
import { AnswerTraceSchema } from '../dist/core/trace.js';
import { FileAnswerTraceWriter, readJsonlTraces } from '../dist/core/trace-writer.js';

const root = process.cwd();
const failures = [];

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

function detectMissingTraces(servedAnswers, traces) {
  const traceIds = new Set(traces.map((trace) => trace.traceId));
  return servedAnswers.filter((answer) => !traceIds.has(answer.traceId));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const traceDdl = read('sql/answer_trace_ddl.sql');
const traceModel = read('cube/model/ai_answer_traces.yml');
const ledgerModel = read('cube/model/ai_token_usage.yml');
const roadmap = read('specs/ROADMAP.md');

for (const snippet of [
  'primary_request_id',
  'answer_hash',
  'evidence_count',
  'context_complete    boolean',
  'degradation_mode    text',
  "CHECK (degradation_mode IN ('fail_closed', 'degrade_with_disclosure'))",
  'envelope            jsonb       NOT NULL'
]) {
  if (!traceDdl.includes(snippet)) failures.push(`answer_trace DDL missing reconciliation field: ${snippet}`);
}

for (const forbidden of ['model ', 'provider ', 'cost_usd', 'total_tokens', 'prompt_tokens', 'completion_tokens']) {
  if (traceDdl.includes(forbidden)) failures.push(`answer_trace DDL must not copy ledger-owned field text: ${forbidden}`);
}

for (const snippet of [
  'primary_request_id',
  'ai_token_usage',
  '{CUBE}.primary_request_id = {ai_token_usage}.request_id',
  'context_complete',
  'degradation_mode',
  'partial_context_answers',
  'partial_context_rate',
  'ungrounded_answers'
]) {
  if (!traceModel.includes(snippet)) failures.push(`ai_answer_traces model missing reconciliation field: ${snippet}`);
}

for (const snippet of ['request_id', 'total_cost_usd', 'total_tokens']) {
  if (!ledgerModel.includes(snippet)) failures.push(`ai_token_usage model missing trace join field: ${snippet}`);
}

if (!roadmap.includes('Trace-store outage test: answers continue, alarm fires, reconciliation quantifies the gap')) {
  failures.push('ROADMAP.md must preserve trace reconciliation exit criterion.');
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hometown-trace-recon-'));
const tracePath = path.join(tmpDir, 'answer-traces.jsonl');
const writer = new FileAnswerTraceWriter(tracePath);
const factory = new DarkFactoryEngine();
factory.registerIntegration({
  integrationId: 'enterprise_crm_slice',
  supportedEntities: ['Customer'],
  async fetchContext(entityId) {
    return makeRecord(entityId);
  }
});

const answer = await factory.answerWithTrace('enterprise_crm_slice', 'cust-1', {
  featureTag: 'internal_summary_partial_allowed',
  entityType: 'Customer',
  questionText: 'What is the customer status?',
  appId: 'reconciliation-verifier',
  userId: 'user-1',
  tenantId: 'tenant-1',
  primaryRequestId: 'ledger-request-1',
  answerText: 'The customer status is active.',
  traceWriter: writer
});

assert(answer.traceWrite.succeeded, 'served answer should write a trace through FileAnswerTraceWriter');
assert(answer.trace.primaryRequestId === 'ledger-request-1', 'primaryRequestId must remain the ledger request_id join key');
assert(answer.trace.answer.hash.length === 64, 'trace should store only answer hash');
assert(!JSON.stringify(answer.trace).includes('The customer status is active.'), 'trace must not store answer text');
assert(!JSON.stringify(answer.trace).includes('What is the customer status?'), 'trace must not store question text unless policy-gated');
assert(answer.trace.evidence[0]?.recordHash.length === 64, 'evidence must use semantic record hash');
assert(!JSON.stringify(answer.trace).includes('"status":"active"'), 'trace must not store evidence record bodies');
assert(answer.trace.promptEnvelope.sections[0]?.evidenceRefs[0] === 0, 'prompt shape should reference evidence by index');
assert(!JSON.stringify(answer.trace).includes('prompt text'), 'trace must not store prompt text');

const traces = await readJsonlTraces(tracePath);
assert(traces.length === 1, `expected one trace in file, got ${traces.length}`);
assert(traces[0]?.traceId === answer.trace.traceId, 'served answer should have matching trace_id in trace store');
AnswerTraceSchema.parse(traces[0]);

const missing = detectMissingTraces([
  { traceId: answer.trace.traceId, primaryRequestId: answer.trace.primaryRequestId },
  { traceId: '22222222-2222-4222-8222-222222222222', primaryRequestId: 'ledger-request-missing' }
], traces);
assert(missing.length === 1, `expected one deliberate missing trace, got ${missing.length}`);
assert(missing[0]?.primaryRequestId === 'ledger-request-missing', 'reconciliation should identify the deliberate missing trace');

const failingWriter = {
  async write() {
    throw new Error('simulated_trace_store_outage');
  }
};
const answerDuringOutage = await factory.answerWithTrace('enterprise_crm_slice', 'cust-2', {
  featureTag: 'internal_summary_partial_allowed',
  entityType: 'Customer',
  questionText: 'Can this answer survive trace outage?',
  appId: 'reconciliation-verifier',
  userId: 'user-1',
  primaryRequestId: 'ledger-request-outage',
  traceWriter: failingWriter
});
assert(answerDuringOutage.answerText.length > 0, 'trace write failure must not block answer return');
assert(answerDuringOutage.traceWrite.attempted, 'trace write outage should still be recorded as attempted');
assert(!answerDuringOutage.traceWrite.succeeded, 'trace write outage should mark trace write as failed');
assert(answerDuringOutage.traceWrite.error === 'simulated_trace_store_outage', 'trace write failure should preserve error category');

if (failures.length > 0) {
  console.error('Trace reconciliation verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Trace reconciliation verification passed. Served answers write ATE v0.2 traces, deliberate missing traces are detected, and trace write failures do not block answers.');