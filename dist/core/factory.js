import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { SemanticRecordSchema } from './types.js';
import { getFeatureDegradationPolicy, getRetrievalTierPolicy } from './retrieval-policy.js';
import { hashAnswerText, hashQuestionText, hashSemanticRecord } from './hash.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class DarkFactoryEngine {
    integrations = new Map();
    circuitStates = new Map();
    async bootAssemblyLines() {
        const integrationsPath = path.join(__dirname, '../integrations');
        if (!fs.existsSync(integrationsPath)) {
            console.log(`[Factory Engine] Integrations workspace directory missing. Bootstrapping dynamic node lookup.`);
            return;
        }
        const directories = fs.readdirSync(integrationsPath);
        for (const dir of directories) {
            const fullPath = path.join(integrationsPath, dir, 'index.js');
            if (fs.existsSync(fullPath)) {
                const Module = await import(`file://${fullPath}`);
                const plugin = new Module.default();
                this.registerIntegration(plugin);
                console.log(`[Factory Engine] Activated Autonomous Integration Node: ${plugin.integrationId}`);
            }
        }
    }
    registerIntegration(plugin) {
        this.integrations.set(plugin.integrationId, plugin);
    }
    async queryContext(integrationId, entityId) {
        const result = await this.queryContextWithPolicy(integrationId, entityId, {
            featureTag: 'legacy_query_context'
        });
        if (!result.record) {
            throw new Error(result.reason ?? `No governed context returned for ${integrationId}:${entityId}`);
        }
        return result.record;
    }
    async queryContextWithPolicy(integrationId, entityId, options = {}) {
        const line = this.integrations.get(integrationId);
        if (!line)
            throw new Error(`Operational integration node '${integrationId}' not loaded inside engine execution boundary.`);
        const entityType = options.entityType ?? this.inferEntityType(line);
        const tierPolicy = getRetrievalTierPolicy(integrationId, entityType);
        if (!tierPolicy)
            throw new Error(`No retrieval tier policy declared for ${integrationId}:${entityType}.`);
        const degradationPolicy = getFeatureDegradationPolicy(options.featureTag ?? 'legacy_query_context');
        const attempt = await this.fetchWithGovernance(line, entityId, tierPolicy, degradationPolicy);
        const contextComplete = attempt.status === 'ok';
        const evidenceCount = contextComplete ? 1 : 0;
        const requiredSourceMissing = degradationPolicy.requiredSources.includes(integrationId) && attempt.status !== 'ok';
        const belowEvidenceThreshold = evidenceCount < degradationPolicy.minimumEvidenceThreshold;
        const retrieval = {
            attempted: [attempt],
            degradationMode: degradationPolicy.mode,
            contextComplete
        };
        if (contextComplete && attempt.record) {
            return {
                status: 'ok',
                record: attempt.record,
                retrieval
            };
        }
        if (degradationPolicy.mode === 'fail_closed' || requiredSourceMissing || belowEvidenceThreshold) {
            return {
                status: 'refused',
                reason: requiredSourceMissing ? 'context_unavailable' : 'minimum_evidence_not_met',
                retrieval
            };
        }
        return {
            status: 'degraded',
            reason: 'context_unavailable',
            retrieval: {
                ...retrieval,
                disclosure: `Context from ${integrationId} was unavailable; response may be incomplete.`
            }
        };
    }
    async answerWithTrace(integrationId, entityId, options) {
        const featureTag = options.featureTag ?? 'legacy_query_context';
        const context = await this.queryContextWithPolicy(integrationId, entityId, {
            featureTag,
            entityType: options.entityType
        });
        const answerText = options.answerText ?? this.buildMinimalAnswer(context, integrationId, entityId);
        const primaryRequestId = options.primaryRequestId ?? `local-${crypto.randomUUID()}`;
        const evidence = context.record
            ? [
                {
                    integrationId,
                    entityId: context.record.entityId,
                    entityName: context.record.entityName,
                    recordHash: hashSemanticRecord(context.record),
                    asOf: new Date().toISOString(),
                    validation: 'passed',
                    tenantId: this.extractTenantId(context.record),
                    retrieval: {
                        method: 'integration'
                    }
                }
            ]
            : [];
        const trace = {
            traceId: crypto.randomUUID(),
            schemaVersion: 'ate/0.2',
            createdAt: new Date().toISOString(),
            origin: {
                org: options.originOrg ?? 'twg',
                system: options.originSystem ?? 'hometown-ekg'
            },
            principal: {
                appId: options.appId,
                userId: options.userId,
                tenantId: options.tenantId,
                featureTag
            },
            query: {
                hash: hashQuestionText(options.questionText),
                text: options.storeQuestionText ? options.questionText : undefined,
                targetIntegrationId: integrationId,
                targetEntityId: entityId
            },
            retrieval: {
                attempted: context.retrieval.attempted.map((attempt) => ({
                    source: attempt.source,
                    status: attempt.status,
                    latencyMs: attempt.latencyMs
                })),
                degradationMode: context.retrieval.degradationMode,
                contextComplete: context.retrieval.contextComplete
            },
            evidence,
            promptEnvelope: {
                templateId: 'minimal-factory-answer',
                templateVersion: '0.1.0',
                sections: [
                    {
                        name: 'governed_context_refs',
                        evidenceRefs: evidence.length > 0 ? [0] : [],
                        tokenCount: evidence.length > 0 ? 32 : 0
                    }
                ],
                totalPromptTokens: evidence.length > 0 ? 32 : 0
            },
            modelCalls: [
                {
                    requestId: primaryRequestId,
                    role: 'final_answer'
                }
            ],
            primaryRequestId,
            answer: {
                hash: hashAnswerText(answerText),
                finishReason: context.status === 'refused' ? 'refused' : 'stop'
            }
        };
        const traceWrite = {
            attempted: Boolean(options.traceWriter),
            succeeded: false,
            error: undefined
        };
        if (options.traceWriter) {
            try {
                await options.traceWriter.write(trace);
                traceWrite.succeeded = true;
            }
            catch (error) {
                traceWrite.error = error instanceof Error ? error.message : 'unknown_trace_write_error';
                console.error(`[Trace Writer] Non-blocking trace write failure for ${trace.traceId}: ${traceWrite.error}`);
            }
        }
        return { answerText, trace, context, traceWrite };
    }
    buildMinimalAnswer(context, integrationId, entityId) {
        if (context.status === 'refused')
            return `Unable to answer because governed context is unavailable for ${integrationId}:${entityId}.`;
        if (context.status === 'degraded')
            return context.retrieval.disclosure ?? `Context was incomplete for ${integrationId}:${entityId}.`;
        return `Generated answer using governed context reference ${context.record?.entityId ?? entityId}.`;
    }
    extractTenantId(record) {
        const tenantId = record.attributes.tenantId;
        return typeof tenantId === 'string' ? tenantId : undefined;
    }
    inferEntityType(line) {
        const [entityType] = line.supportedEntities;
        if (!entityType)
            throw new Error(`Integration ${line.integrationId} declares no supported entity types.`);
        return entityType;
    }
    async fetchWithGovernance(line, entityId, tierPolicy, degradationPolicy) {
        const source = line.integrationId;
        const timeoutMs = Math.min(tierPolicy.timeoutMs, degradationPolicy.perSourceTimeoutMs[source] ?? tierPolicy.timeoutMs, degradationPolicy.overallRetrievalTimeoutMs);
        const state = this.getCircuitState(source);
        const now = Date.now();
        if (state.openUntil > now) {
            return {
                source,
                status: 'error',
                latencyMs: 0,
                errorCategory: 'circuit_open'
            };
        }
        if (!this.tryEnterSourceBudget(source, tierPolicy, state, now)) {
            return {
                source,
                status: 'error',
                latencyMs: 0,
                errorCategory: 'source_budget_exceeded'
            };
        }
        const started = Date.now();
        try {
            const rawOutput = await this.withTimeout(line.fetchContext(entityId), timeoutMs);
            const latencyMs = Date.now() - started;
            if (!rawOutput) {
                this.recordFailure(state);
                return { source, status: 'empty', latencyMs, errorCategory: 'empty_result' };
            }
            const record = SemanticRecordSchema.parse(rawOutput);
            this.recordSuccess(state);
            return { source, status: 'ok', latencyMs, record };
        }
        catch (error) {
            const latencyMs = Date.now() - started;
            this.recordFailure(state);
            return {
                source,
                status: error instanceof Error && error.message === 'retrieval_timeout' ? 'timeout' : 'error',
                latencyMs,
                errorCategory: error instanceof Error ? error.message : 'unknown_error'
            };
        }
        finally {
            state.inFlight = Math.max(0, state.inFlight - 1);
        }
    }
    async withTimeout(promise, timeoutMs) {
        let timeout;
        const timeoutPromise = new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('retrieval_timeout')), timeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        }
        finally {
            if (timeout)
                clearTimeout(timeout);
        }
    }
    getCircuitState(source) {
        const existing = this.circuitStates.get(source);
        if (existing)
            return existing;
        const created = { consecutiveFailures: 0, openUntil: 0, inFlight: 0, recentStarts: [] };
        this.circuitStates.set(source, created);
        return created;
    }
    tryEnterSourceBudget(source, tierPolicy, state, now) {
        const windowStart = now - 1_000;
        state.recentStarts = state.recentStarts.filter((startedAt) => startedAt >= windowStart);
        if (state.inFlight >= tierPolicy.sourceLoadBudget.maxConcurrent)
            return false;
        if (state.recentStarts.length >= tierPolicy.sourceLoadBudget.maxSustainedQps)
            return false;
        state.inFlight += 1;
        state.recentStarts.push(now);
        return true;
    }
    recordSuccess(state) {
        state.consecutiveFailures = 0;
        state.openUntil = 0;
    }
    recordFailure(state) {
        state.consecutiveFailures += 1;
        if (state.consecutiveFailures >= 3) {
            state.openUntil = Date.now() + 30_000;
        }
    }
}
