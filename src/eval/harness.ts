import * as fs from 'fs/promises';
import * as path from 'path';
import { DarkFactoryEngine } from '../core/factory.js';
import { FileAnswerTraceWriter } from '../core/trace-writer.js';
import { AnswerTrace } from '../core/trace.js';

export type GoldenQuestionTarget = {
  integrationId: string;
  entityId: string;
  entityType: string;
};

export type GoldenQuestion = {
  id: string;
  domain: string;
  ownerReviewStatus: string;
  question: string;
  expectedBehaviorNote: string;
  shouldRefuse: boolean;
  refusalReason?: string;
  featureTag: string;
  target: GoldenQuestionTarget;
};

export type GoldenQuestionSuite = {
  suiteId: string;
  status: string;
  questions: GoldenQuestion[];
};

export type LedgerFixtureUsage = {
  requestId: string;
  model: string;
  featureTag: string;
  costUsd: number;
  totalTokens: number;
};

export type EvalRunRecord = {
  evalRunId: string;
  suiteId: string;
  createdAt: string;
  judgeModel: string;
  judgePromptVersion: string;
  questionCount: number;
};

export type EvalResultRecord = {
  evalRunId: string;
  questionId: string;
  domain: string;
  featureTag: string;
  traceId: string;
  primaryRequestId: string;
  groundednessScore: number;
  refusalCorrect: boolean;
  correct: boolean;
  judgeModel: string;
  judgePromptVersion: string;
  notes: string;
};

export type EvalHarnessOutput = {
  run: EvalRunRecord;
  results: EvalResultRecord[];
  traces: AnswerTrace[];
  costPerCorrectAnswer: Array<{
    model: string;
    featureTag: string;
    correctAnswers: number;
    totalCostUsd: number;
    costPerCorrectAnswer: number | null;
  }>;
};

export type EvalHarnessOptions = {
  suitePath: string;
  outputDir: string;
  engine: DarkFactoryEngine;
  ledgerFixture: LedgerFixtureUsage[];
  evalRunId?: string;
  judgeModel?: string;
  judgePromptVersion?: string;
};

export async function loadGoldenQuestionSuite(suitePath: string): Promise<GoldenQuestionSuite> {
  const parsed = JSON.parse(await fs.readFile(suitePath, 'utf8')) as GoldenQuestionSuite;
  if (!parsed.suiteId || !Array.isArray(parsed.questions)) {
    throw new Error(`Invalid golden-question suite: ${suitePath}`);
  }
  for (const question of parsed.questions) {
    if (!question.id || !question.domain || !question.question || !question.featureTag) {
      throw new Error(`Invalid golden-question entry in ${suitePath}`);
    }
    if (!question.target?.integrationId || !question.target.entityId || !question.target.entityType) {
      throw new Error(`Invalid golden-question target for ${question.id}`);
    }
  }
  return parsed;
}

export async function runEvalHarness(options: EvalHarnessOptions): Promise<EvalHarnessOutput> {
  const suite = await loadGoldenQuestionSuite(options.suitePath);
  const evalRunId = options.evalRunId ?? `eval-${Date.now()}`;
  const judgeModel = options.judgeModel ?? 'stub-local-deterministic';
  const judgePromptVersion = options.judgePromptVersion ?? 'stub-groundedness-v0.1';
  await fs.mkdir(options.outputDir, { recursive: true });
  const tracePath = path.join(options.outputDir, 'answer-traces.jsonl');
  const writer = new FileAnswerTraceWriter(tracePath);
  const traces: AnswerTrace[] = [];
  const results: EvalResultRecord[] = [];

  for (const question of suite.questions) {
    const primaryRequestId = `${evalRunId}:${question.id}:final`;
    const answer = await options.engine.answerWithTrace(question.target.integrationId, question.target.entityId, {
      featureTag: question.featureTag,
      entityType: question.target.entityType,
      questionText: question.question,
      appId: 'eval-harness',
      userId: 'eval-runner',
      primaryRequestId,
      traceWriter: writer
    });
    traces.push(answer.trace);

    const score = scoreWithStubJudge(question, answer.trace);
    results.push({
      evalRunId,
      questionId: question.id,
      domain: question.domain,
      featureTag: question.featureTag,
      traceId: answer.trace.traceId,
      primaryRequestId,
      groundednessScore: score.groundednessScore,
      refusalCorrect: score.refusalCorrect,
      correct: score.correct,
      judgeModel,
      judgePromptVersion,
      notes: score.notes
    });
  }

  const run: EvalRunRecord = {
    evalRunId,
    suiteId: suite.suiteId,
    createdAt: new Date().toISOString(),
    judgeModel,
    judgePromptVersion,
    questionCount: suite.questions.length
  };
  const output = {
    run,
    results,
    traces,
    costPerCorrectAnswer: computeCostPerCorrectAnswer(results, options.ledgerFixture)
  };

  await fs.writeFile(path.join(options.outputDir, 'eval-run.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(options.outputDir, 'eval-results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(options.outputDir, 'cost-per-correct-answer.json'), `${JSON.stringify(output.costPerCorrectAnswer, null, 2)}\n`, 'utf8');

  return output;
}

export function scoreWithStubJudge(question: GoldenQuestion, trace: AnswerTrace): {
  groundednessScore: number;
  refusalCorrect: boolean;
  correct: boolean;
  notes: string;
} {
  const refused = trace.answer.finishReason === 'refused';
  const hasEvidence = trace.evidence.length > 0;
  const groundednessScore = hasEvidence && trace.retrieval.contextComplete ? 1 : 0;
  const refusalCorrect = question.shouldRefuse ? refused : !refused;
  const correct = question.shouldRefuse ? refusalCorrect : refusalCorrect && groundednessScore >= 1;
  const notes = question.shouldRefuse
    ? `refusal ${refusalCorrect ? 'matched' : 'did not match'} expected behavior`
    : `groundedness=${groundednessScore}; contextComplete=${trace.retrieval.contextComplete}`;

  return { groundednessScore, refusalCorrect, correct, notes };
}

export function computeCostPerCorrectAnswer(
  results: EvalResultRecord[],
  ledgerFixture: LedgerFixtureUsage[]
): EvalHarnessOutput['costPerCorrectAnswer'] {
  const byRequest = new Map(ledgerFixture.map((entry) => [entry.requestId, entry]));
  const groups = new Map<string, { model: string; featureTag: string; correctAnswers: number; totalCostUsd: number }>();

  for (const result of results) {
    const usage = byRequest.get(result.primaryRequestId);
    if (!usage) continue;
    const key = `${usage.model}\t${usage.featureTag}`;
    const group = groups.get(key) ?? {
      model: usage.model,
      featureTag: usage.featureTag,
      correctAnswers: 0,
      totalCostUsd: 0
    };
    group.totalCostUsd += usage.costUsd;
    if (result.correct) group.correctAnswers += 1;
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    costPerCorrectAnswer: group.correctAnswers > 0 ? group.totalCostUsd / group.correctAnswers : null
  }));
}