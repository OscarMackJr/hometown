# Enterprise Knowledge Graph Roadmap

Status: Active
Version: 2026-07-28 — consolidated. This file supersedes the previous split between ROADMAP.md (original baseline) and ROADMAP_integration_hometown.md (Popeye-program integration); both are retired and their content is carried here.
Audience: hometown team - enterprise architects, platform engineers, semantic model owners, and future implementation agents
Primary post-read action: choose the next implementation slice, and know exactly which Popeye-program work belongs to this team and which does not.

## Purpose

This is the source-controlled roadmap for the Enterprise Knowledge Graph project. The project goal is unchanged: a code-first semantic layer for enterprise AI systems, where CRM, ledger, Intrepid, and future divisional systems contribute verified business context without a central warehouse, proprietary ontology, or cross-cloud data migration.

Alongside that original goal, hometown is also the **semantic reporting and provenance tier of the Popeye program** (the organization-wide AI usage governance control plane). That adds work to Stage 1 and adds Stages 4 and 5, but it does not change the project's identity. Cost and provenance are business domains like loans and customers; they get governed Cube models here because this is where governed models live.

Stage 6 remains the project's own definition of done: an operational cross-domain semantic context service. The Popeye-program stages are prerequisites to it, not replacements for it.

## The Boundary With Popeye (Read This First)

hometown and popeye meet at exactly one join key and one vocabulary:

- Popeye's gateway writes a spend ledger; every request has a `request_id`. hometown reads that ledger through the read-only `ekg_cube_reader` role and models it as `ai_token_usage`. hometown never writes to the ledger.
- Attribution vocabulary (`app_id`, `user_id`, `tenant_id`, `feature_tag`, passed as `spend_logs_metadata`) is shared verbatim between the two systems so they cannot drift.
- The Answer Trace Envelope (Stage 4) joins the ledger on `primary_request_id`. Design rule: anything the ledger owns (model, tokens, cost) is joined, never copied.

hometown does NOT own: the gateway, virtual keys, budgets, provider credentials, gateway infrastructure, endpoint (nono) policy, or the popeye Terraform. If a task involves any of those, it belongs to the popeye team.

popeye does NOT own: Cube models, the semantic record contract, the trace contract, GraphRAG, or any decision about what evidence means. The gateway is deliberately semantics-blind.

## Source Documents

- [Enterprise Knowledge Graph Design Requirements](./EKG_DESIGN_REQUIREMENTS_v0.1.md) - architecture, POC/MVP scope, governance requirements.
- [Why We Are Using Cube](./WHY_CUBE_SEMANTIC_LAYER.md) - the semantic-layer decision and anti-Palantir rationale.
- [Nexus CRM Integration Notes](./NEXUS_CRM_INTEGRATION_NOTES_v0.1.md) - CRM boundary and first CRM GraphRAG slice.
- [Intrepid Loan Engine Integration Notes](./INTREPID_LOAN_ENGINE_INTEGRATION_NOTES_v0.1.md) - Intrepid domain and tenant safety.
- [Intrepid Sandbox Schema Mapping Contract](./INTREPID_SANDBOX_SCHEMA_MAPPING_v0.1.md) - non-production Intrepid verification.
- [Answer Trace Envelope v0.1](./ANSWER_TRACE_ENVELOPE_v0.1.md) - the original Stage 4 provenance contract; implementation now records ATE v0.2 retrieval/degradation metadata.
- Popeye program documents (`popeye` repo, `specs/`): the popeye team roadmap, the governance roadmap v0.2, the infrastructure plan, and the Stage 1 kickoff. Read for context; their tasks are not this team's tasks except where restated below.
- [Tenant Isolation: Defense In Depth v0.1](./TENANT_ISOLATION_DEFENSE_IN_DEPTH_v0.1.md) - database-enforced tenant isolation requirements.
- [Retrieval Tiering And Source-System Load Budget v0.1](./RETRIEVAL_TIERING_AND_SOURCE_LOAD_v0.1.md) - retrieval freshness, tiering, and source load requirements.
- [Semantic Path Degradation Policy v0.1](./SEMANTIC_PATH_DEGRADATION_v0.1.md) - feature-level fail-closed/degrade behavior and ATE v0.2 retrieval status.
- [Answer Trace Viewer v0.1](./TRACE_VIEWER_v0.1.md) - narrow read-only provenance inspection surface.
- [Minimal Evaluation Harness v0.1](./EVAL_HARNESS_MINIMAL_v0.1.md) - pulled-forward seed evaluation harness requirements.
- [Implementation Roadmap: New Requirements Review](./IMPLEMENTATION_ROADMAP_NEW_REQUIREMENTS_20260801.md) - completed Phase 1-7 implementation queue.
- [STATE](./STATE.md) - current implementation state and resumption tasks.

## Roadmap Stages

### Stage 0: Baseline Contract And Validation

Unchanged. Goal: divisional integrations emit semantic records through one shared engine contract. Largely complete for the local prototype; the validation gate remains required for all future integration changes, including everything Stages 4 and 5 add.

### Stage 1: Cube Semantic Layer POC (extended)

Goal: establish Cube Open Source as the governed semantic layer over source systems - and, new in this revision, over the Popeye spend ledger.

Existing remaining work (unchanged):

- Replace placeholder CRM and ledger mappings with source-specific models.
- Decide the first CRM read path (API/service-only, Cube direct read, or both).
- Add model ownership metadata and versioning conventions.
- Add pre-aggregation or caching patterns for common entity lookups.

New work (supports Popeye Stage 1, the two-week POC):

- Land `cube/model/ai_token_usage.yml` over the gateway ledger; validate through the existing scaffold validator.
- Run the POC chargeback queries (tokens and dollars by app, user, model, cloud) for the day-10 CTO demo.
- Add `verify:gateway:ledger-reconciliation` and `verify:gateway:attribution` TypeScript verifiers to the `verify:*` family.
- Confirm the `ekg_cube_reader` grant pattern against the gateway database (sql promoted from the POC compose profile).

Exit addition: one governed query answers AI spend by application, user, model, and cloud for the POC window.

### Stage 2: Intrepid Non-Production Slice

Unchanged and still the active next engineering slice. Tenant-scoped, production-shaped Intrepid integration against non-production data; tasks and exit criteria as previously written. Note for sequencing: Stage 2's tenant-isolation work is the direct on-ramp to Stage 5 (governed access), so mismatches found here should be recorded with that future consumer in mind.

### Stage 3: Nexus CRM Context Slice

Unchanged, planned. First CRM GraphRAG slice per the CRM integration notes. New note: when this slice lands, its GraphRAG path becomes the first writer of Stage 4 trace envelopes, so Stage 3 and Stage 4 can be developed by the same pair in sequence.

### Stage 4: Answer Provenance (Answer Trace Envelope) - chartered as Popeye program POC A

Goal: make every AI answer explainable after the fact - evidence, prompt shape, model calls, and (by ledger join) cost.

All engineering lands in this repository; the popeye dependency (ledger + request_id) already exists and requires no popeye-side changes.

Recommended path:

1. Land the contract: `src/core/trace.ts` (AnswerTraceSchema beside SemanticRecordSchema), CI-validated like every other contract.
2. Apply `sql/answer_trace_ddl.sql`; writer role INSERT-only (immutability by grant), `ekg_cube_reader` SELECT.
3. Implement `IAnswerTraceWriter` in the engine's query path: write after the final model call, before releasing the answer; a write failure alarms, never blocks.
4. Land `cube/model/ai_answer_traces.yml` with the `ai_token_usage` join.
5. Add `verify:trace:contract` and `verify:trace:reconciliation` to the validation gate.

Guardrails: references and hashes only, never bodies; `query.text` and `retrieval.cubeQuery` policy-gated per feature tag; traces append-only; ledger facts joined, never copied.

Exit criteria:

- A GraphRAG answer produces a validated trace with at least one evidence record and a resolvable ledger join.
- The `ungrounded_answers` measure returns correct results against seeded traces, including one deliberate zero-evidence trace.
- Trace-store outage test: answers continue, alarm fires, reconciliation quantifies the gap.
- Empty `policy` and `signature` slots round-trip through validation (Stage 5 and federation forward-compatibility proven by test).

### Stage 5: Governed Semantic Access - chartered as Popeye program POC B

Goal: Entra-group-driven authorization on semantic queries - who may ask what - closing this project's longest-standing open decision (the production authorization model for cross-divisional context).

Scope for the POC slice:

- Map Entra groups to Cube security contexts; enforce tenant filters as non-removable policy (the Intrepid tenant guardrail made structural).
- Prove the pattern on Intrepid's tenant dimension plus one CRM visibility rule.
- Audit allowed and denied context requests into the Stage 4 trace store (`policy` block populated; no schema bump).

Honest scope note: production-grade ABAC across all divisions is MVP work beyond this stage, and dependent on divisional owner decisions.

Exit criteria:

- The same question from two differently-entitled identities returns correctly different evidence sets, and both outcomes are visible in traces.
- A denied request produces an audited denial, not a silent empty result.

### Stage 6: Cross-Domain GraphRAG And MVP Shared Service

Goal: turn the POC into an operational semantic context service for initial enterprise AI workflows. This is the project's definition of done beyond the Popeye-program stages above.

Current status: future.

Required capabilities:

- Cross-domain GraphRAG over verified CRM, ledger, and Intrepid context.
- Managed Cube deployment in AWS or Azure.
- Production secret management outside source control.
- Environment-specific source configuration.
- Authorization before context retrieval and prompt construction (delivered by Stage 5; hardened here).
- Audit traces for GraphRAG requests (delivered by Stage 4; operationalized here).
- Operational logging for validation failures, source failures, and provider failures.
- Onboarding process for future divisional integrations.

Exit criteria:

- At least one CRM assistant workflow uses verified semantic context.
- The primary context lookup meets the agreed latency target.
- A third integration can be onboarded through the documented contract and validation process.
- Runbooks exist for source connection failures, validation failures, and integration rollback.

### Later, Referenced But Not Chartered Here

- Minimal evaluation harness has been pulled forward locally: seed golden questions run through the governed traced answer path with deterministic stub scoring and cost-per-correct-answer from a ledger fixture. Full POC C continuous evaluation, larger owner-reviewed suites, and live judge routing remain future work.
- Federation (POC E) consumes the signed envelope; it earns its own repository only if the exchange becomes a deployable service.

## Sequencing Summary For The Team

Stage 2 (Intrepid slice) remains the active slice. The Stage 1 extension (ai_token_usage + verifiers) is small and runs alongside it in support of the Popeye two-week POC. Stage 3 then Stage 4 in sequence (same GraphRAG path). Stage 5 alongside popeye's Azure build-out, since both are Entra identity work.

## Open Decisions

Carried forward from the pre-integration roadmap. Items also tracked in STATE.md Known Gaps are listed here because they are roadmap-shaping, not just implementation gaps.

- First managed deployment target: AWS ECS/EKS or Azure Container Apps/AKS.
- First LLM provider integration: AWS Bedrock or Azure OpenAI. Note: Popeye's gateway makes this reversible, which is an argument for deciding it late rather than early.
- First production latency target for CRM context lookup.
- Whether the MVP needs RDF/OWL export, or Cube semantic models are enough for the first release.
- Canonical enterprise customer identity across CRM, ledger, and Intrepid. This one gates cross-domain GraphRAG in Stage 6: without an agreed identity spine, cross-domain joins are guesswork.
- Retention and residency policy for Answer Trace Envelope records (ATE spec section 7).
- Per-feature-tag policy registry for `query.text` and `retrieval.cubeQuery` storage.
- Production authorization model details for cross-divisional context beyond the Stage 5 POC.
