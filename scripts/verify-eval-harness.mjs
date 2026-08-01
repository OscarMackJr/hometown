import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DarkFactoryEngine } from '../dist/core/factory.js';
import { readJsonlTraces } from '../dist/core/trace-writer.js';
import { runEvalHarness } from '../dist/eval/harness.js';

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function makeCrmRecord(entityId) {
  return {
    entityId,
    entityName: `Customer ${entityId}`,
    attributes: {
      tenantId: 'tenant-eval',
      lifecycleStatus: 'active',
      internalOnlyEvidenceBody: 'do-not-copy-evidence-body'
    },
    relationships: []
  };
}

const root = process.cwd();
const suitePath = path.join(root, 'eval', 'golden.seed.json');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hometown-eval-harness-'));
const evalRunId = 'eval-seed-run-001';
const engine = new DarkFactoryEngine();
engine.registerIntegration({
  integrationId: 'enterprise_crm_slice',
  supportedEntities: ['Customer'],
  async fetchContext(entityId) {
    if (entityId === 'cust_eval_degraded') throw new Error('crm_seed_degraded');
    return makeCrmRecord(entityId);
  }
});
engine.registerIntegration({
  integrationId: 'intrepid_loan_engine',
  supportedEntities: ['LoanProcessingRun'],
  async fetchContext() {
    throw new Error('intrepid_seed_unavailable');
  }
});

const ledgerFixture = [
  {
    requestId: `${evalRunId}:crm-grounded-001:final`,
    model: 'stub-answer-model',
    featureTag: 'internal_summary_partial_allowed',
    costUsd: 0.03,
    totalTokens: 100
  },
  {
    requestId: `${evalRunId}:crm-degraded-001:final`,
    model: 'stub-answer-model',
    featureTag: 'internal_summary_partial_allowed',
    costUsd: 0.02,
    totalTokens: 80
  },
  {
    requestId: `${evalRunId}:intrepid-refusal-001:final`,
    model: 'stub-answer-model',
    featureTag: 'customer_or_regulated_advice',
    costUsd: 0.01,
    totalTokens: 40
  }
];

const output = await runEvalHarness({
  suitePath,
  outputDir: tmpDir,
  engine,
  ledgerFixture,
  evalRunId,
  judgeModel: 'stub-local-deterministic',
  judgePromptVersion: 'stub-groundedness-v0.1'
});

assert(output.run.evalRunId === evalRunId, 'eval run id should be recorded');
assert(output.run.questionCount === 3, `runner should execute three seed questions, got ${output.run.questionCount}`);
assert(output.results.length === 3, `runner should record three eval results, got ${output.results.length}`);
assert(output.traces.length === 3, `runner should produce three traces, got ${output.traces.length}`);

const tracePath = path.join(tmpDir, 'answer-traces.jsonl');
const storedTraces = await readJsonlTraces(tracePath);
const traceIds = new Set(storedTraces.map((trace) => trace.traceId));
for (const result of output.results) {
  assert(traceIds.has(result.traceId), `eval result ${result.questionId} should reference a valid trace id`);
  assert(result.judgeModel === 'stub-local-deterministic', `eval result ${result.questionId} should record judge model`);
  assert(result.judgePromptVersion === 'stub-groundedness-v0.1', `eval result ${result.questionId} should record judge prompt version`);
}

const grounded = output.results.find((result) => result.questionId === 'crm-grounded-001');
assert(grounded?.groundednessScore === 1, 'grounded seed case should score groundedness 1');
assert(grounded?.refusalCorrect === true, 'grounded seed case should not refuse');
assert(grounded?.correct === true, 'grounded seed case should be correct');

const degraded = output.results.find((result) => result.questionId === 'crm-degraded-001');
assert(degraded?.groundednessScore === 0, 'degraded seed case should score groundedness 0');
assert(degraded?.refusalCorrect === true, 'degraded seed case should not be treated as refusal');
assert(degraded?.correct === false, 'degraded ungrounded seed case should not count correct');

const refusal = output.results.find((result) => result.questionId === 'intrepid-refusal-001');
assert(refusal?.groundednessScore === 0, 'refusal seed case should have no grounded evidence');
assert(refusal?.refusalCorrect === true, 'refusal seed case should evaluate refusal correctness');
assert(refusal?.correct === true, 'expected refusal should count correct when refusal behavior matches');

const costByFeature = new Map(output.costPerCorrectAnswer.map((entry) => [entry.featureTag, entry]));
const internalSummaryCost = costByFeature.get('internal_summary_partial_allowed');
assert(internalSummaryCost?.correctAnswers === 1, 'internal summary cost group should have one correct answer');
assert(internalSummaryCost?.totalCostUsd === 0.05, 'internal summary cost group should sum ledger fixture cost');
assert(internalSummaryCost?.costPerCorrectAnswer === 0.05, 'internal summary cost per correct answer should be computed');
const refusalCost = costByFeature.get('customer_or_regulated_advice');
assert(refusalCost?.correctAnswers === 1, 'refusal cost group should have one correct answer');
assert(refusalCost?.costPerCorrectAnswer === 0.01, 'refusal cost per correct answer should be computed');

const evalResultsJson = fs.readFileSync(path.join(tmpDir, 'eval-results.json'), 'utf8');
for (const forbidden of [
  'do-not-copy-evidence-body',
  'What is the status of customer',
  'Summarize customer',
  'Can you advise',
  'Generated answer using governed context',
  'Unable to answer because governed context',
  'prompt text',
  'answer text',
  'evidence body'
]) {
  assert(!evalResultsJson.includes(forbidden), `eval results must not copy sensitive/body content: ${forbidden}`);
}

const ddl = fs.readFileSync(path.join(root, 'sql', 'eval_harness_ddl.sql'), 'utf8');
for (const required of ['CREATE TABLE IF NOT EXISTS eval_run', 'CREATE TABLE IF NOT EXISTS eval_result', 'trace_id', 'judge_model', 'judge_prompt_version', 'groundedness_score', 'refusal_correct']) {
  assert(ddl.includes(required), `eval harness DDL missing ${required}`);
}
for (const forbidden of ['answer_text', 'prompt_text', 'evidence_body', 'completion_text']) {
  assert(!ddl.includes(forbidden), `eval harness DDL must not store ${forbidden}`);
}

if (failures.length > 0) {
  console.error('Eval harness verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Eval harness verification passed. Seed questions execute through traced answers, eval results reference traces, scoring and cost-per-correct-answer are CI-safe.');