import { AnswerTraceSchema, ATE_SCHEMA_VERSION } from '../dist/core/trace.js';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);

function baseTrace(overrides = {}) {
  return {
    traceId: '11111111-1111-4111-8111-111111111111',
    schemaVersion: ATE_SCHEMA_VERSION,
    createdAt: '2026-07-30T18:27:00.000Z',
    origin: {
      org: 'twg',
      system: 'hometown-ekg'
    },
    principal: {
      appId: 'hometown-local',
      userId: 'user-1',
      tenantId: 'tenant-1',
      featureTag: 'trace-contract-verifier'
    },
    query: {
      hash: hashA,
      targetIntegrationId: 'intrepid_loan_engine',
      targetEntityId: 'INTREPID_RUN_2026_Q2_001'
    },
    retrieval: {
      attempted: [
        {
          source: 'intrepid_loan_engine',
          status: 'ok',
          latencyMs: 42
        }
      ],
      degradationMode: 'fail_closed',
      contextComplete: true
    },
    evidence: [
      {
        integrationId: 'intrepid_loan_engine',
        entityId: 'INTREPID_RUN_2026_Q2_001',
        entityName: 'Loan Processing Run INTREPID_RUN_2026_Q2_001',
        recordHash: hashB,
        asOf: '2026-07-30T18:27:00.000Z',
        validation: 'passed',
        tenantId: 'tenant-1',
        retrieval: {
          method: 'cube',
          cubeQueryHash: hashC
        }
      }
    ],
    promptEnvelope: {
      templateId: 'contract-verifier',
      templateVersion: '0.2.0',
      sections: [
        {
          name: 'evidence',
          evidenceRefs: [0],
          tokenCount: 32
        }
      ],
      totalPromptTokens: 32
    },
    modelCalls: [
      {
        requestId: 'req-final-1',
        role: 'final_answer'
      }
    ],
    primaryRequestId: 'req-final-1',
    answer: {
      hash: hashA,
      finishReason: 'stop'
    },
    ...overrides
  };
}

function expectValid(label, trace) {
  const result = AnswerTraceSchema.safeParse(trace);
  if (!result.success) {
    throw new Error(`${label} should be valid: ${result.error.message}`);
  }
  return result.data;
}

function expectInvalid(label, trace, pathFragment) {
  const result = AnswerTraceSchema.safeParse(trace);
  if (result.success) {
    throw new Error(`${label} should be invalid`);
  }
  const issueText = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  if (!issueText.includes(pathFragment)) {
    throw new Error(`${label} failed for the wrong reason. Expected "${pathFragment}" in:\n${issueText}`);
  }
}

const valid = expectValid('minimum ATE v0.2 trace', baseTrace());
if (valid.schemaVersion !== 'ate/0.2') {
  throw new Error(`Expected ATE schema version ate/0.2, got ${valid.schemaVersion}`);
}

expectInvalid(
  'invalid retrieval status',
  baseTrace({
    retrieval: {
      attempted: [{ source: 'intrepid_loan_engine', status: 'stale', latencyMs: 42 }],
      degradationMode: 'fail_closed',
      contextComplete: false
    }
  }),
  'retrieval.attempted.0.status'
);

expectInvalid(
  'invalid degradationMode',
  baseTrace({
    retrieval: {
      attempted: [{ source: 'intrepid_loan_engine', status: 'ok', latencyMs: 42 }],
      degradationMode: 'answer_anyway',
      contextComplete: true
    }
  }),
  'retrieval.degradationMode'
);

expectInvalid(
  'primaryRequestId missing from modelCalls',
  baseTrace({ primaryRequestId: 'req-missing' }),
  'primaryRequestId'
);

expectInvalid(
  'out-of-range evidenceRefs',
  baseTrace({
    promptEnvelope: {
      templateId: 'contract-verifier',
      templateVersion: '0.2.0',
      sections: [
        {
          name: 'evidence',
          evidenceRefs: [1],
          tokenCount: 32
        }
      ],
      totalPromptTokens: 32
    }
  }),
  'evidenceRefs'
);

const emptyForwardSlots = expectValid(
  'empty forward-compatible policy slot with omitted signature slot',
  baseTrace({
    policy: {}
  })
);

if (!emptyForwardSlots.policy || Object.keys(emptyForwardSlots.policy).length !== 0) {
  throw new Error('Expected empty policy slot to round-trip as an empty object');
}
if ('signature' in emptyForwardSlots) {
  throw new Error('Expected omitted signature slot to remain omitted');
}

console.log('Trace contract verification passed. ATE v0.2 schema accepts retrieval metadata and rejects invalid retrieval/status invariants.');