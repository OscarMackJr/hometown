import { readJsonlTraces } from '../core/trace-writer.js';
export async function listRecentTraces(store, filters = {}) {
    const traces = await readStore(store);
    const filtered = traces
        .filter((trace) => matchesFilters(trace, filters))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, filters.limit ?? 50);
    return filtered.map(toListItem);
}
export async function findTraceByTraceId(store, traceId) {
    const traces = await readStore(store);
    const trace = traces.find((candidate) => candidate.traceId === traceId);
    return trace ? toDetail(trace, store.ledgerUsage) : undefined;
}
export async function findTraceByPrimaryRequestId(store, primaryRequestId) {
    const traces = await readStore(store);
    const trace = traces.find((candidate) => candidate.primaryRequestId === primaryRequestId);
    return trace ? toDetail(trace, store.ledgerUsage) : undefined;
}
export function renderTraceDetailHtml(detail) {
    const evidenceRows = detail.evidence.map((evidence) => `
        <tr>
          <td>${escapeHtml(evidence.integrationId)}</td>
          <td>${escapeHtml(evidence.entityId)}</td>
          <td>${escapeHtml(evidence.entityName)}</td>
          <td>${escapeHtml(evidence.asOf)}</td>
          <td><code>${escapeHtml(evidence.recordHash)}</code></td>
          <td>${escapeHtml(evidence.validation)}</td>
          <td>${escapeHtml(evidence.tenantId ?? '')}</td>
        </tr>`).join('');
    const attemptRows = detail.retrieval.attempted.map((attempt) => `
        <tr>
          <td>${escapeHtml(attempt.source)}</td>
          <td>${escapeHtml(attempt.status)}</td>
          <td>${attempt.latencyMs}</td>
        </tr>`).join('');
    const promptRows = detail.promptShape.sections.map((section) => `
        <tr>
          <td>${escapeHtml(section.name)}</td>
          <td>${escapeHtml(section.evidenceRefs.join(', '))}</td>
          <td>${section.tokenCount}</td>
        </tr>`).join('');
    const modelRows = detail.modelCalls.map((call) => `
        <tr>
          <td>${escapeHtml(call.requestId)}</td>
          <td>${escapeHtml(call.role)}</td>
        </tr>`).join('');
    const policyRows = detail.policy?.decisions?.map((decision) => `
        <tr>
          <td>${escapeHtml(decision.policyId)}</td>
          <td>${escapeHtml(decision.effect)}</td>
        </tr>`).join('') ?? '';
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Answer Trace ${escapeHtml(detail.traceId)}</title>
</head>
<body>
  <main>
    <h1>Answer Trace</h1>
    <section>
      <h2>Identity</h2>
      <dl>
        <dt>Trace ID</dt><dd>${escapeHtml(detail.traceId)}</dd>
        <dt>Primary Request ID</dt><dd>${escapeHtml(detail.primaryRequestId)}</dd>
        <dt>Question Hash</dt><dd><code>${escapeHtml(detail.question.hash)}</code></dd>
        ${detail.question.text ? `<dt>Question Text</dt><dd>${escapeHtml(detail.question.text)}</dd>` : ''}
        <dt>App</dt><dd>${escapeHtml(detail.appId)}</dd>
        <dt>User</dt><dd>${escapeHtml(detail.userId)}</dd>
        <dt>Feature</dt><dd>${escapeHtml(detail.featureTag)}</dd>
      </dl>
    </section>
    <section>
      <h2>Retrieval</h2>
      <p>Context complete: ${detail.contextComplete}</p>
      <p>Degradation mode: ${escapeHtml(detail.degradationMode)}</p>
      <table><thead><tr><th>Source</th><th>Status</th><th>Latency ms</th></tr></thead><tbody>${attemptRows}</tbody></table>
    </section>
    <section>
      <h2>Evidence</h2>
      <table><thead><tr><th>Source</th><th>Entity ID</th><th>Entity Name</th><th>As Of</th><th>Record Hash</th><th>Validation</th><th>Tenant</th></tr></thead><tbody>${evidenceRows}</tbody></table>
    </section>
    <section>
      <h2>Prompt Shape</h2>
      <p>Template: ${escapeHtml(detail.promptShape.templateId)} / ${escapeHtml(detail.promptShape.templateVersion)}</p>
      <p>Total prompt tokens: ${detail.promptShape.totalPromptTokens}</p>
      <table><thead><tr><th>Section</th><th>Evidence refs</th><th>Token count</th></tr></thead><tbody>${promptRows}</tbody></table>
    </section>
    <section>
      <h2>Model Calls</h2>
      <table><thead><tr><th>Request ID</th><th>Role</th></tr></thead><tbody>${modelRows}</tbody></table>
    </section>
    <section>
      <h2>Cost</h2>
      ${detail.cost ? `<dl><dt>Total tokens</dt><dd>${detail.cost.totalTokens ?? ''}</dd><dt>Prompt tokens</dt><dd>${detail.cost.promptTokens ?? ''}</dd><dt>Completion tokens</dt><dd>${detail.cost.completionTokens ?? ''}</dd><dt>Cost USD</dt><dd>${detail.cost.costUsd ?? ''}</dd></dl>` : '<p>No ledger fixture available.</p>'}
    </section>
    <section>
      <h2>Policy</h2>
      <table><thead><tr><th>Policy ID</th><th>Effect</th></tr></thead><tbody>${policyRows}</tbody></table>
    </section>
  </main>
</body>
</html>`;
}
async function readStore(store) {
    return readJsonlTraces(store.tracePath);
}
function matchesFilters(trace, filters) {
    if (filters.userId && trace.principal.userId !== filters.userId)
        return false;
    if (filters.appId && trace.principal.appId !== filters.appId)
        return false;
    if (filters.featureTag && trace.principal.featureTag !== filters.featureTag)
        return false;
    if (filters.from && trace.createdAt < filters.from)
        return false;
    if (filters.to && trace.createdAt > filters.to)
        return false;
    return true;
}
function toListItem(trace) {
    return {
        traceId: trace.traceId,
        primaryRequestId: trace.primaryRequestId,
        createdAt: trace.createdAt,
        appId: trace.principal.appId,
        userId: trace.principal.userId,
        tenantId: trace.principal.tenantId,
        featureTag: trace.principal.featureTag,
        contextComplete: trace.retrieval.contextComplete,
        degradationMode: trace.retrieval.degradationMode,
        evidenceCount: trace.evidence.length
    };
}
function toDetail(trace, ledgerUsage = []) {
    const cost = ledgerUsage.find((entry) => entry.requestId === trace.primaryRequestId);
    return {
        ...toListItem(trace),
        question: {
            hash: trace.query.hash,
            text: trace.query.text
        },
        evidence: trace.evidence.map((evidence) => ({
            integrationId: evidence.integrationId,
            entityId: evidence.entityId,
            entityName: evidence.entityName,
            asOf: evidence.asOf,
            recordHash: evidence.recordHash,
            validation: evidence.validation,
            tenantId: evidence.tenantId
        })),
        retrieval: trace.retrieval,
        promptShape: trace.promptEnvelope,
        modelCalls: trace.modelCalls,
        policy: trace.policy,
        cost: cost
            ? {
                costUsd: cost.costUsd,
                promptTokens: cost.promptTokens,
                completionTokens: cost.completionTokens,
                totalTokens: cost.totalTokens
            }
            : undefined
    };
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
