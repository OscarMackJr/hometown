# Implementation Roadmap: New Requirements Review

Status: Draft for agent execution
Date: 2026-08-01
Source specs:

- `TENANT_ISOLATION_DEFENSE_IN_DEPTH_v0.1.md`
- `RETRIEVAL_TIERING_AND_SOURCE_LOAD_v0.1.md`
- `SEMANTIC_PATH_DEGRADATION_v0.1.md`
- `TRACE_VIEWER_v0.1.md`
- `EVAL_HARNESS_MINIMAL_v0.1.md`

## Current Codebase Assessment

The current repository has a thin but useful semantic runtime foundation:

- `src/core/types.ts` defines `SemanticRecordSchema` and `ISemanticIntegration`.
- `src/core/factory.ts` loads integrations and validates returned semantic records.
- `src/core/trace.ts` defines ATE v0.1 and the `IAnswerTraceWriter` interface.
- `sql/answer_trace_ddl.sql` defines an append-only `answer_trace` store.
- `cube/model/ai_answer_traces.yml` joins traces to `ai_token_usage`.
- `cube/model/intrepid_*.yml` uses tenant-aware dimensions and joins.
- `scripts/verify-intrepid-tenant-safety.mjs` statically verifies tenant filters and tenant-scoped joins.

The new specs introduce requirements that are not implemented yet:

- Database row-level security is not present in the local Intrepid schema.
- Tenant safety verification is static, not a database-backed negative proof.
- Retrieval tier, freshness, source budget, timeout, and circuit-breaker configuration does not exist.
- ATE is still `ate/0.1`; it has evidence-level retrieval metadata but no top-level retrieval attempt/degradation summary.
- No feature-tag degradation policy registry exists.
- No trace writer implementation or trace reconciliation verifier exists.
- No trace viewer exists.
- No eval run/result schema, runner, judge route, or golden-question format exists.

One existing verifier also needs repair before it can be trusted: `scripts/verify-gateway-access.mjs` reads the deleted `specs/ROADMAP_integration_hometown.md`; it should read `specs/ROADMAP.md`.

## Sequencing Principle

Implement foundation before consumers:

1. Database tenant isolation first, because trace viewer and eval harness create new read paths.
2. Retrieval policy and degradation next, because ATE v0.2 and eval refusal cases depend on it.
3. ATE v0.2 after the policy shape is real.
4. Trace writer and Cube measures after the schema is stable.
5. Trace viewer after tenant isolation and trace data exist.
6. Minimal eval harness after trace and ledger joins are available.

## Phase 1: Repair Current Verification Baseline

Goal: make the existing verification suite honest before adding new requirements.

Implementation tasks:

- Update `scripts/verify-gateway-access.mjs` to read `specs/ROADMAP.md`.
- Add missing npm scripts referenced by `STATE.md` if they do not exist yet:
  - `verify:trace:contract`
  - `verify:trace:reconciliation`
- Add a trace contract verifier that imports/builds `AnswerTraceSchema` and validates:
  - valid minimum trace
  - invalid `primaryRequestId`
  - out-of-range `promptEnvelope.sections[].evidenceRefs`
  - empty `policy` and `signature` slots

Verification:

- `npm run build`
- `npm run validate:cube`
- `npm run verify:gateway:access`
- `npm run verify:trace:contract`

Exit criteria:

- Existing verifiers do not reference deleted roadmap files.
- Trace contract validation is executable from `npm`.

Suggested agent prompt:

> Repair the current hometown verification baseline. Update any verifier that references the retired `specs/ROADMAP_integration_hometown.md` so it uses the consolidated `specs/ROADMAP.md`. Add `verify:trace:contract` and a focused trace contract verifier for the existing ATE v0.1 Zod schema. Keep changes scoped to scripts/package metadata and run the build plus relevant verifiers.

## Phase 2: Tenant Isolation Defense In Depth

Goal: satisfy `REQ-TEN-01` through `REQ-TEN-04` for the Intrepid sandbox and establish the pattern for future source tables.

Implementation tasks:

- Add SQL migration or smoke-schema changes that:
  - create a tenant session setting convention, for example `app.current_tenant_id`
  - enable and force RLS on tenant-scoped tables:
    - `loan_run`
    - `loan_fact`
    - `loan_exceptions`
    - `portfolio_exceptions`
    - future Bluto tables when introduced
  - add policies that compare `tenant_id` to the session setting
  - fail closed when no tenant setting exists
  - ensure `ekg_cube_reader` is not owner, superuser, or `BYPASSRLS`
- Extend sandbox seed data with at least two tenants.
- Replace or extend `verify:intrepid:tenant-safety` with database-backed checks:
  - positive: same query under two tenant session identities returns disjoint rows
  - negative: query without Cube tenant filters still returns only the session tenant
  - fail-closed: no session tenant returns zero rows
  - grant assertion: role and table RLS/force-RLS state are correct
- Document the session-setting mechanism in `cube/README.md`.

Verification:

- `npm run verify:intrepid:sandbox-mapping:docker`
- `npm run verify:intrepid:tenant-safety`
- `npm run query:cube:intrepid:sandbox`

Exit criteria:

- Database RLS alone prevents cross-tenant reads.
- A missing tenant context returns zero tenant-scoped rows.
- Tenant safety is no longer only a static Cube-model assertion.

Suggested agent prompt:

> Implement tenant isolation defense in depth for the Intrepid sandbox. Add forced PostgreSQL RLS over all tenant-scoped Intrepid tables, seed a second tenant, and extend `verify:intrepid:tenant-safety` to prove positive tenant scoping, Cube-filter-disabled negative isolation, fail-closed behavior, and reader-role grant invariants. Preserve the existing Cube tenant filters as layer 1.

## Phase 3: Retrieval Tiering, Source Budgets, And Degradation Policy

Goal: create the configuration and runtime policy surface required by `REQ-RET-*` and `REQ-REL-*`.

Implementation tasks:

- Add a typed configuration module for entity retrieval policy:
  - entity type
  - source integration
  - tier: `L`, `P`, or `M`
  - declared freshness bound
  - permitted read target
  - timeout budget
  - source rate/concurrency budget metadata
- Add a typed feature degradation policy registry:
  - feature tag
  - mode: `fail_closed` or `degrade_with_disclosure`
  - required sources
  - per-source timeout
  - overall retrieval timeout
  - minimum evidence threshold
  - default for undeclared feature tags: `fail_closed`
- Introduce retrieval attempt tracking in the engine path:
  - source
  - status: `ok`, `timeout`, `error`, or `empty`
  - latencyMs
  - context completeness
- Add timeout handling around integration/Cube calls.
- Add a small in-process concurrency/rate limiter suitable for local POC verification.
- Add circuit-breaker state per source for sustained failures or latency.
- Ensure Bluto-unavailable behavior is represented as narrower retrieval, not looser matching, once Bluto integration exists.

Verification:

- Unit/contract verifier for policy defaults.
- Verifier with a fake source that times out.
- Verifier showing `fail_closed` refuses when a required source is unavailable.
- Verifier showing `degrade_with_disclosure` returns partial context metadata.

Exit criteria:

- No retrievable entity type lacks a tier assignment.
- No feature tag can silently answer without a degradation policy.
- Source failures produce declared behavior and machine-readable retrieval attempts.

Suggested agent prompt:

> Add typed retrieval tier and feature degradation policy configuration. Wire the factory retrieval path to enforce timeouts, record per-source retrieval attempts, default undeclared features to `fail_closed`, and expose enough metadata for ATE v0.2. Include verifiers for policy completeness, timeout/error handling, fail-closed refusal, and disclosed partial-context behavior.

## Phase 4: ATE v0.2 And Cube Provenance Measures

Goal: make partial context and retrieval status first-class trace facts.

Implementation tasks:

- Update `src/core/trace.ts` from `ate/0.1` to `ate/0.2`, or support both versions during migration if existing traces must remain readable.
- Add top-level `retrieval` to `AnswerTraceSchema`:
  - `attempted: [{ source, status, latencyMs }]`
  - `degradationMode`
  - `contextComplete`
- Keep evidence bodies, prompt text, and answer text out of the schema.
- Update `sql/answer_trace_ddl.sql` with queryable columns if useful:
  - `context_complete`
  - `degradation_mode`
  - possibly generated/indexed JSONB paths for retrieval status
- Update `cube/model/ai_answer_traces.yml`:
  - dimension: `degradation_mode`
  - dimension or segment: `context_complete`
  - measure: `partial_context_answers`
  - measure: `partial_context_rate`
- Update trace contract verifier for ATE v0.2.

Verification:

- `npm run verify:trace:contract`
- `npm run validate:cube`
- Seeded trace check for `contextComplete = false`.

Exit criteria:

- Partial-context rate is queryable through Cube.
- Trace validation rejects malformed retrieval-attempt records.

Suggested agent prompt:

> Rev the Answer Trace Envelope to v0.2 by adding top-level retrieval attempts, degradation mode, and context completeness. Update the SQL DDL, Cube answer-trace model, and trace contract verifier so partial context is recorded and queryable. Preserve the references-and-hashes-only privacy rule.

## Phase 5: Trace Writer And Reconciliation

Goal: produce traces from the normal answer path and detect trace gaps without blocking answers.

Implementation tasks:

- Implement a concrete `IAnswerTraceWriter` for Postgres or a local file-backed test fixture, depending on available environment.
- Add canonical hash helpers for semantic records, question text, and answer text.
- Wire trace creation into the first executable GraphRAG/factory answer path available in this repo.
- Add `verify:trace:reconciliation`:
  - compare answer events/model calls to traces written
  - detect missing trace for a served answer
  - verify ledger join by `primary_request_id` when local ledger data exists
- Ensure trace-write failure alarms/logs but does not block answer return.

Verification:

- `npm run verify:trace:contract`
- `npm run verify:trace:reconciliation`
- `npm run verify:gateway:ledger-reconciliation`

Exit criteria:

- At least one seeded answer creates a valid trace.
- A deliberate missing trace is detected by reconciliation.
- Trace writer does not copy ledger-owned model/cost/token facts.

Suggested agent prompt:

> Implement the first concrete answer trace writer and reconciliation verifier. Generate a valid ATE v0.2 trace from the normal answer path, join by `primary_request_id` to the gateway ledger model where available, and prove trace-write failure is observable but non-blocking.

## Phase 6: Minimal Trace Viewer

Goal: satisfy the narrow demo requirement without turning hometown into a product UI.

Implementation tasks:

- Add a small read-only viewer in this repo.
- Prefer a minimal server-rendered Node app or static SPA with a thin read API.
- Support:
  - lookup by trace/request id
  - recent trace list filtered by user, application, feature tag, and time
  - selected trace detail
- Display:
  - question hash and optional permitted question text
  - evidence references and hashes
  - retrieval attempts and context completeness
  - prompt shape, not prompt text
  - model calls
  - joined cost/tokens from `ai_token_usage`
  - policy decisions when present
- Enforce read-only access by database grants.
- Rely on database RLS for tenant isolation; do not add viewer-specific tenant filtering as the only control.

Verification:

- Contract/query test for trace lookup.
- Tenant negative test using the viewer read role.
- Grant assertion: viewer role has no write privileges.
- Manual demo against seeded traces.

Exit criteria:

- A seeded trace can be inspected in one place.
- Cross-tenant trace lookup fails by inherited database policy.
- No prompt or completion content is displayed or stored.

Suggested agent prompt:

> Build the minimal read-only Answer Trace Viewer in the hometown repo. It should list/filter traces, show a selected trace with evidence, retrieval status, prompt shape, model calls, joined cost, and policy decisions, and prove tenant isolation is inherited from database RLS. Keep it intentionally narrow and do not display prompt or answer bodies.

## Phase 7: Minimal Eval Harness

Goal: pull forward the smallest useful POC C slice: golden questions, groundedness/refusal scoring, and cost per correct answer.

Implementation tasks:

- Add golden-question file format under `specs/eval/` or `eval/`:
  - domain
  - owner/review status
  - question
  - expected behavior note
  - should refuse flag/reason
  - feature tag
  - target entity/source hints
- Seed Intrepid with a small initial set; track the requirement for twenty owner-reviewed questions per onboarded domain.
- Add SQL DDL for:
  - `eval_run`
  - `eval_result`
  - foreign/reference link to `trace_id`
  - judge model and prompt version
  - groundedness score
  - refusal correctness
  - cost per correct answer query inputs
- Add a runner that executes through the normal path and records trace ids.
- Route judge calls through the governed gateway under a dedicated feature tag and budget metadata when the gateway is available.
- Provide a local deterministic stub judge for offline CI.
- Add Cube model or query script for cost per correct answer by model and feature tag.

Verification:

- Harness executes a tiny local golden set.
- Deliberately ungrounded answer scores low in stub mode.
- Refusal cases verify degradation policy behavior.
- Judge/eval spend appears under its own feature tag when live gateway mode is enabled.
- Cost per correct answer query returns a result for seeded data.

Exit criteria:

- Evaluation references trace ids, not copied evidence bodies.
- Groundedness and refusal correctness are reportable.
- Cost per correct answer joins evaluation results to `ai_token_usage`.

Suggested agent prompt:

> Implement the minimal eval harness. Add golden-question files, `eval_run` and `eval_result` storage, a runner that executes through the normal retrieval/answer path and records trace ids, stubbed CI scoring for groundedness/refusal correctness, and a cost-per-correct-answer query joined through `ai_token_usage`. Keep full continuous evaluation gates out of scope.

## Cross-Cutting Decisions To Resolve

- ATE migration policy: hard switch to `ate/0.2` or dual-read `ate/0.1` plus `ate/0.2`.
- Session tenant mechanism for Cube/Postgres connection pooling.
- Whether retrieval tier/source budget config lives as TypeScript, YAML, or database-backed config.
- Source-owner agreement artifact location and template.
- Shared disclosure wording for `degrade_with_disclosure`.
- Judge model family and prompt versioning convention.
- Trace viewer app shape: server-rendered Node app versus small SPA plus API.

## Recommended First Implementation Slice

Start with Phase 1 and Phase 2 together only if the agent has enough time to run Docker-backed verification. Otherwise run Phase 1 alone first. The tenant RLS work is the highest-risk requirement and should land before new read consumers are added.

