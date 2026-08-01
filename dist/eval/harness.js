import * as fs from 'fs/promises';
import * as path from 'path';
import { FileAnswerTraceWriter } from '../core/trace-writer.js';
export async function loadGoldenQuestionSuite(suitePath) {
    const parsed = JSON.parse(await fs.readFile(suitePath, 'utf8'));
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
export async function runEvalHarness(options) {
    const suite = await loadGoldenQuestionSuite(options.suitePath);
    const evalRunId = options.evalRunId ?? `eval-${Date.now()}`;
    const judgeModel = options.judgeModel ?? 'stub-local-deterministic';
    const judgePromptVersion = options.judgePromptVersion ?? 'stub-groundedness-v0.1';
    await fs.mkdir(options.outputDir, { recursive: true });
    const tracePath = path.join(options.outputDir, 'answer-traces.jsonl');
    const writer = new FileAnswerTraceWriter(tracePath);
    const traces = [];
    const results = [];
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
    const run = {
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
export function scoreWithStubJudge(question, trace) {
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
export function computeCostPerCorrectAnswer(results, ledgerFixture) {
    const byRequest = new Map(ledgerFixture.map((entry) => [entry.requestId, entry]));
    const groups = new Map();
    for (const result of results) {
        const usage = byRequest.get(result.primaryRequestId);
        if (!usage)
            continue;
        const key = `${usage.model}\t${usage.featureTag}`;
        const group = groups.get(key) ?? {
            model: usage.model,
            featureTag: usage.featureTag,
            correctAnswers: 0,
            totalCostUsd: 0
        };
        group.totalCostUsd += usage.costUsd;
        if (result.correct)
            group.correctAnswers += 1;
        groups.set(key, group);
    }
    return [...groups.values()].map((group) => ({
        ...group,
        costPerCorrectAnswer: group.correctAnswers > 0 ? group.totalCostUsd / group.correctAnswers : null
    }));
}
