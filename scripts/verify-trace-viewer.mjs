import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AnswerTraceSchema } from '../dist/core/trace.js';
import { FileAnswerTraceWriter } from '../dist/core/trace-writer.js';
import {
  findTraceByPrimaryRequestId,
  findTraceByTraceId,
  listRecentTraces,
  renderTraceDetailHtml
} from '../dist/viewer/trace-viewer.js';
import * as viewerModule from '../dist/viewer/trace-viewer.js';

const failures = [];
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);
const hashD = 'd'.repeat(64);

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function makeTrace(overrides = {}) {
  return AnswerTraceSchema.parse({
    traceId: '11111111-1111-4111-8111-111111111111',
    schemaVersion: 'ate/0.2',
    createdAt: '2026-07-30T18:27:00.000Z',
    origin: { org: 'twg', system: 'hometown-ekg' },
    principal: {
      appId: 'viewer-app-a',
      userId: 'viewer-user-a',
      tenantId: 'tenant-a',
      featureTag: 'viewer-feature-a'
    },
    query: {
      hash: hashA,
      targetIntegrationId: 'enterprise_crm_slice',
      targetEntityId: 'cust-a'
    },
    retrieval: {
      attempted: [{ source: 'enterprise_crm_slice', status: 'ok', latencyMs: 12 }],
      degradationMode: 'degrade_with_disclosure',
      contextComplete: true
    },
    evidence: [
      {
        integrationId: 'enterprise_crm_slice',
        entityId: 'cust-a',
        entityName: 'Customer A',
        recordHash: hashB,
        asOf: '2026-07-30T18:26:00.000Z',
        validation: 'passed',
        tenantId: 'tenant-a',
        retrieval: { method: 'integration' }
      }
    ],
    promptEnvelope: {
      templateId: 'viewer-template',
      templateVersion: '0.1.0',
      sections: [{ name: 'governed_context_refs', evidenceRefs: [0], tokenCount: 24 }],
      totalPromptTokens: 24
    },
    modelCalls: [{ requestId: 'viewer-request-a', role: 'final_answer' }],
    primaryRequestId: 'viewer-request-a',
    answer: { hash: hashC, finishReason: 'stop' },
    policy: {
      decisions: [{ policyId: 'policy-a', effect: 'allow' }]
    },
    ...overrides
  });
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hometown-trace-viewer-'));
const tracePath = path.join(tmpDir, 'answer-traces.jsonl');
const writer = new FileAnswerTraceWriter(tracePath);

const traceA = makeTrace();
const traceB = makeTrace({
  traceId: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-07-31T18:27:00.000Z',
  principal: {
    appId: 'viewer-app-b',
    userId: 'viewer-user-b',
    tenantId: 'tenant-b',
    featureTag: 'viewer-feature-b'
  },
  query: {
    hash: hashD,
    text: 'Policy permitted question text',
    targetIntegrationId: 'intrepid_loan_engine',
    targetEntityId: 'run-b'
  },
  retrieval: {
    attempted: [{ source: 'intrepid_loan_engine', status: 'timeout', latencyMs: 1000 }],
    degradationMode: 'fail_closed',
    contextComplete: false
  },
  evidence: [],
  promptEnvelope: {
    templateId: 'viewer-template',
    templateVersion: '0.1.0',
    sections: [{ name: 'governed_context_refs', evidenceRefs: [], tokenCount: 0 }],
    totalPromptTokens: 0
  },
  modelCalls: [{ requestId: 'viewer-request-b', role: 'final_answer' }],
  primaryRequestId: 'viewer-request-b',
  answer: { hash: hashB, finishReason: 'refused' },
  policy: {
    decisions: [{ policyId: 'policy-b', effect: 'deny' }]
  }
});

await writer.write(traceA);
await writer.write(traceB);

const store = {
  tracePath,
  ledgerUsage: [
    {
      requestId: 'viewer-request-a',
      totalTokens: 42,
      promptTokens: 24,
      completionTokens: 18,
      costUsd: 0.0123
    }
  ]
};

const byTraceId = await findTraceByTraceId(store, traceA.traceId);
assert(byTraceId?.traceId === traceA.traceId, 'viewer should look up trace by trace id');
assert(byTraceId?.primaryRequestId === 'viewer-request-a', 'detail should include primary request id');
assert(byTraceId?.question.hash === hashA, 'detail should include question hash');
assert(byTraceId?.question.text === undefined, 'detail should omit question text when absent from trace');
assert(byTraceId?.evidence[0]?.integrationId === 'enterprise_crm_slice', 'detail should include evidence source');
assert(byTraceId?.evidence[0]?.recordHash === hashB, 'detail should include evidence record hash');
assert(byTraceId?.retrieval.attempted[0]?.status === 'ok', 'detail should include retrieval attempt status');
assert(byTraceId?.contextComplete === true, 'detail should include contextComplete');
assert(byTraceId?.degradationMode === 'degrade_with_disclosure', 'detail should include degradation mode');
assert(byTraceId?.promptShape.templateId === 'viewer-template', 'detail should include prompt template id');
assert(byTraceId?.modelCalls[0]?.requestId === 'viewer-request-a', 'detail should include model calls');
assert(byTraceId?.policy?.decisions?.[0]?.policyId === 'policy-a', 'detail should include policy decisions');
assert(byTraceId?.cost?.totalTokens === 42, 'detail should include joined ledger fixture tokens when available');

const byRequestId = await findTraceByPrimaryRequestId(store, 'viewer-request-b');
assert(byRequestId?.traceId === traceB.traceId, 'viewer should look up trace by primary request id');
assert(byRequestId?.question.text === 'Policy permitted question text', 'detail should show question text only when stored in trace');
assert(byRequestId?.cost === undefined, 'detail should omit cost when no ledger fixture exists');

const recent = await listRecentTraces(store);
assert(recent[0]?.traceId === traceB.traceId, 'recent trace list should sort newest first');
assert(recent.length === 2, `recent trace list should include both traces, got ${recent.length}`);

const byUser = await listRecentTraces(store, { userId: 'viewer-user-a' });
assert(byUser.length === 1 && byUser[0]?.traceId === traceA.traceId, 'viewer should filter by user');
const byApp = await listRecentTraces(store, { appId: 'viewer-app-b' });
assert(byApp.length === 1 && byApp[0]?.traceId === traceB.traceId, 'viewer should filter by app');
const byFeature = await listRecentTraces(store, { featureTag: 'viewer-feature-b' });
assert(byFeature.length === 1 && byFeature[0]?.traceId === traceB.traceId, 'viewer should filter by feature tag');
const byTime = await listRecentTraces(store, { from: '2026-07-31T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' });
assert(byTime.length === 1 && byTime[0]?.traceId === traceB.traceId, 'viewer should filter by time range');

const html = renderTraceDetailHtml(byTraceId);
for (const required of [
  traceA.traceId,
  'viewer-request-a',
  hashA,
  'enterprise_crm_slice',
  'cust-a',
  hashB,
  'passed',
  'degrade_with_disclosure',
  'viewer-template',
  'policy-a',
  '42',
  '0.0123'
]) {
  assert(html.includes(required), `rendered detail should include ${required}`);
}

for (const forbidden of [
  'prompt text',
  'completion text',
  'answer text',
  'evidence body',
  'Customer status is active',
  '"status":"active"'
]) {
  assert(!html.includes(forbidden), `viewer must not render forbidden content: ${forbidden}`);
}

const exportedNames = Object.keys(viewerModule);
for (const forbiddenExport of ['createTrace', 'writeTrace', 'updateTrace', 'deleteTrace', 'removeTrace']) {
  assert(!exportedNames.includes(forbiddenExport), `viewer module must not export write API: ${forbiddenExport}`);
}

const viewerSource = fs.readFileSync(path.join(process.cwd(), 'src', 'viewer', 'trace-viewer.ts'), 'utf8');
for (const forbiddenSource of ['appendFile', 'writeFile', 'unlink', 'rm(', 'DELETE ', 'UPDATE ', 'INSERT ']) {
  assert(!viewerSource.includes(forbiddenSource), `viewer source must remain read-only; found ${forbiddenSource}`);
}

if (failures.length > 0) {
  console.error('Trace viewer verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Trace viewer verification passed. Read-only lookup, filtering, detail projection, safe rendering, and content omission are covered.');