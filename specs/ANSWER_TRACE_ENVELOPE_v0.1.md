# Answer Trace Envelope (ATE) Schema Specification

Version: 0.1
Status: Draft — POC A contract
Audience: hometown engine maintainers, popeye owners, POC C (evaluation) and POC E (federation) designers, CTO reviewers
Primary post-read action: review the schema and the four design rules, then approve landing the contract (Zod schema, DDL, Cube model) in the hometown repository as POC A's first slice.
Lineage: generalizes the SIT-CIP Context Answer Envelope (CAE) from a single-application pattern into an ecosystem contract.

## 1. Purpose

The Answer Trace Envelope is the durable record that makes every AI answer in the TWG ecosystem explainable after the fact: what was asked, what governed evidence was used, how the prompt was shaped, which model calls produced it, and — by join — what it cost and under which policy. It is the primitive behind the "click an answer, see its evidence, its policy, and its price" demo (portfolio doc, POC A), the substrate POC C scores groundedness against, and the payload POC E signs and exchanges across organizations.

## 2. Ownership And Placement

- **The contract lives in hometown.** The ATE schema sits beside `SemanticRecordSchema` in `src/core/`, validated by the same Zod gate, versioned by the same conventions. hometown's GraphRAG/prompt-construction path is the writer: it is the only component that knows which semantic records entered a prompt.
- **Popeye contributes exactly one thing: the join key.** `request_id` (and the model-call list) links the trace to the `ai_token_usage` ledger. Popeye never writes traces, never reads them, and never learns what evidence means.
- **POC A is a chartered cross-repo effort, not a repository.** hometown lands the schema, writer, DDL, and Cube model; popeye's only change is already shipped (the ledger exists).
- **Physical store**: `answer_trace` table in a hometown-owned database (locally the shared Postgres; MVP alongside the reporting store so the trace-to-ledger join is one database). Cube model `ai_answer_traces` joins `ai_token_usage` on request_id.

## 3. Design Rules

1. **Join, never copy.** Anything the popeye ledger owns — model, provider, tokens, cost, latency — is reached by request_id join. The single documented exception is principal attribution (app_id, user_id, tenant_id, feature_tag), denormalized into the trace so authorization filtering (POC B) needs no cross-store join; the ledger is authoritative on conflict.
2. **References and hashes, never bodies.** The trace stores evidence *references* (integration id, entity id, content hash, as-of time) and prompt *shape* (sections, token counts), never record bodies, prompt text, or completion text. This keeps the trace store inside the standing no-sensitive-payload guardrail and keeps cross-org exchange (POC E) low-sensitivity by construction. Question text is the one policy-gated exception (rule 4).
3. **Append-only, immutable.** Traces are never updated. Evaluations (POC C) are separate records referencing trace_id. Corrections are new traces; the integrity of "what the system did at the time" is the entire point.
4. **Question text is policy-gated per feature tag.** `query.text` is optional and stored only where the owning application's policy flag allows (questions can contain sensitive data). `query.hash` is always stored, so integrity and dedup never depend on the policy decision.

## 4. Schema (v0.1)

Field-by-field. Canonical machine form is the Zod schema (`src/core/trace.ts`); this section is its prose contract.

Envelope identity:

- `traceId` (string, uuid, required): primary key.
- `schemaVersion` (string, required): `"ate/0.1"`. Version-gated like every hometown contract.
- `createdAt` (ISO timestamp, required).
- `origin` (object, required): `{ org: string, system: string }` — e.g. `{ org: "twg", system: "hometown-ekg" }`. The federation slot: POC E populates `org` with the producing organization; single-org deployments still fill it so federation is a value change, not a schema change.

Principal (denormalized from popeye attribution; design rule 1 exception):

- `principal` (object, required): `{ appId, userId, tenantId?, featureTag }` — mirrors the popeye `spend_logs_metadata` convention verbatim so the two systems cannot drift vocabularies.

Question:

- `query` (object, required):
  - `hash` (string, required): SHA-256 of the normalized question text.
  - `text` (string, optional): present only where the feature tag's policy allows (design rule 4).
  - `targetIntegrationId` (string, required) and `targetEntityId` (string, optional): the routing intent, in the core engine's existing vocabulary.

Evidence (the heart of the envelope):

- `evidence` (array, required, may be empty for degenerate no-context answers — an empty array is itself an important, queryable fact):
  - `integrationId` (string, required): which divisional integration produced the record.
  - `entityId` (string, required) and `entityName` (string, required): from the semantic record.
  - `recordHash` (string, required): SHA-256 of the canonical JSON of the validated `SemanticRecord`. Pins exactly what was used even as source systems move on.
  - `asOf` (ISO timestamp, required): when the record was fetched.
  - `validation` (literal `"passed"`, required): only records that cleared the Zod gate may appear as evidence; the field exists so the invariant is visible in the data, not just the code.
  - `tenantId` (string, optional): carried for tenant-scoped sources (Intrepid); enables POC B tenant filtering on traces themselves.
  - `retrieval` (object, optional): `{ method: "cube" | "integration" | "cache", cubeQueryHash?: string, cubeQuery?: object }` — the governed Cube query that fetched the evidence IS machine-readable provenance of *how*; storing it is cheap and is the single most Palantir-differentiating field in the schema. Query JSON contains member names and filter values; where filter values are sensitive, store `cubeQueryHash` only (same policy gate as `query.text`).

Prompt shape (never prompt content):

- `promptEnvelope` (object, required):
  - `templateId` (string, required) and `templateVersion` (string, required): prompt templates become versioned, source-controlled artifacts as a side effect — a deliberate forcing function.
  - `sections` (array, required): `{ name: string, evidenceRefs: number[], tokenCount: number }` — indices into `evidence`, proving which records landed in which section and at what token weight.
  - `totalPromptTokens` (number, required): reconcilable against the ledger's prompt_tokens as a cheap integrity check (POC C can flag divergence).

Model calls (the popeye join):

- `modelCalls` (array, required, min 1): `{ requestId: string, role: string }` — one answer may involve several gateway calls (context compression, final answer, tool selection). `role` is a short label (`"final_answer"`, `"context_summarization"`); the requestId carrying the answer is:
- `primaryRequestId` (string, required): must appear in `modelCalls`. This is THE join key to `ai_token_usage`.

Answer:

- `answer` (object, required):
  - `hash` (string, required): SHA-256 of the completion text. Integrity anchor and the POC C evaluation join — no content stored.
  - `finishReason` (string, optional).

Policy (the POC B slot, designed now, populated later):

- `policy` (object, optional): `{ securityContextHash?: string, decisions?: [{ policyId: string, effect: "allow" | "deny" }] }` — empty today; POC B fills it without a schema version bump.

Signature (the POC E slot, designed now, populated later):

- `signature` (object, optional): `{ alg: string, keyId: string, value: string }` over the canonical form of the envelope minus the signature block. Aligns with ZERO_TRUST_V2's signing posture; a single-org deployment simply omits it.

## 5. Write Path

The hometown engine writes the trace at answer time, after the final model call returns and before the answer is released to the caller — a trace-write failure is logged and alarmed but does not block the answer (the roadmap 4.1 rule: observation never blocks the request path; provenance is observation). The known consequence — an answer can exist without a trace during a store outage — is measured by the same reconciliation pattern as the ledger (roadmap 7.4): answers served versus traces written, per hour.

## 6. Consumers

- **POC A demo**: `ai_answer_traces` Cube model joined to `ai_token_usage` — evidence, policy, tokens, dollars per answer, one query.
- **POC C**: evaluations reference `traceId`, score answers against `evidence[].recordHash`-pinned inputs, and divide by joined cost for cost-per-correct-answer.
- **POC E**: the signed envelope is the cross-org exchange payload; design rule 2 is what makes it exchangeable.
- **Audit/incident**: `principal` + time range + `origin` answers "what did the AI tell whom, based on what" without any content exposure.

## 7. Open Decisions

- Retention and residency for the trace store (interacts with legal/audit requirements; flagged in the portfolio doc).
- An optional encrypted evidence vault storing record bodies for regulated domains where hash-pinning is insufficient for audit — explicitly deferred from v0.1; the schema's `recordHash` is forward-compatible with it.
- The per-feature-tag policy registry that gates `query.text` and `retrieval.cubeQuery` (a small table; owned by hometown; likely merges into POC B's policy model).
- Canonicalization algorithm for hashing and signing (recommend JCS / RFC 8785; must be fixed before POC E signs anything).
