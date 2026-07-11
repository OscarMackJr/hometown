# Enterprise Knowledge Graph Roadmap

Status: Active  
Audience: enterprise architects, platform engineers, semantic model owners, and future implementation agents  
Primary post-read action: choose the next implementation slice without needing the historical Word roadmap.

## Purpose

This is the source-controlled roadmap for the Enterprise Knowledge Graph project. It replaces the Word roadmap as the working planning surface.

The project goal is to build a code-first semantic layer for enterprise AI systems. CRM, ledger, Intrepid, and future divisional systems should contribute verified business context without forcing a central warehouse, proprietary ontology, or cross-cloud data migration.

## Source Documents

Use these Markdown specs for detail:

- [Enterprise Knowledge Graph Design Requirements](./EKG_DESIGN_REQUIREMENTS_v0.1.md) defines the architecture, POC scope, MVP scope, governance requirements, and open decisions.
- [Why We Are Using Cube](./WHY_CUBE_SEMANTIC_LAYER.md) explains the Cube semantic-layer decision and the anti-Palantir architecture rationale.
- [Nexus CRM Integration Notes](./NEXUS_CRM_INTEGRATION_NOTES_v0.1.md) defines the CRM integration boundary, authorization constraints, semantic mappings, and first CRM GraphRAG slice.
- [Intrepid Loan Engine Integration Notes](./INTREPID_LOAN_ENGINE_INTEGRATION_NOTES_v0.1.md) defines the Intrepid domain, tenant safety requirements, semantic mappings, and first run-context slice.
- [Intrepid Sandbox Schema Mapping Contract](./INTREPID_SANDBOX_SCHEMA_MAPPING_v0.1.md) defines the non-production database contract required before Cube-backed Intrepid reads are trusted.
- [Answer Trace Envelope v0.1](./ANSWER_TRACE_ENVELOPE_v0.1.md) defines the POC A answer provenance contract.
- [hometown Registration For POC A](./POC_A_HOMETOWN_REGISTRATION.md) registers Answer Provenance as a hometown roadmap stage, not a new repository.
- [STATE](./STATE.md) records the current implementation state and the next resumption tasks.

The historical Word document remains background material only. Future roadmap updates should happen here.

## Roadmap Stages

### Stage 0: Baseline Contract And Validation

Goal: prove that divisional integrations can emit semantic records through one shared engine contract.

Current status: largely complete for the local prototype.

Completed capabilities:

- TypeScript core engine for routing integration requests.
- Shared semantic record validation with Zod.
- Mock CRM and financial ledger integrations.
- Intrepid integration with mock mode.
- Local factory validation command.
- GitHub Actions validation workflow.

Remaining work:

- Keep the validation gate required for all future integration changes.
- Expand validation beyond mock records as each real integration becomes available.

### Stage 1: Cube Semantic Layer POC

Goal: establish Cube Open Source as the governed semantic layer over source systems.

Current status: in progress and usable as a scaffold.

Completed capabilities:

- Local Cube scaffold.
- Environment placeholders for CRM, ledger, and Intrepid sources.
- Initial semantic model files for enterprise customer, financial ledger, and Intrepid loan concepts.
- Structural Cube scaffold validator.
- Disposable Intrepid smoke test using local Postgres and Cube containers.
- Documentation for local Cube, Intrepid smoke, and sandbox profiles.

Remaining work:

- Replace placeholder CRM and ledger mappings with source-specific CRM and ledger models.
- Decide whether the first CRM read path is API/service-only, Cube direct read, or both.
- Add model ownership metadata and versioning conventions.
- Add pre-aggregation or caching patterns for common entity lookups.

### Stage 2: Intrepid Non-Production Slice

Goal: prove a tenant-scoped, production-shaped divisional integration against non-production Intrepid data.

Current status: active next slice.

Completed capabilities:

- Intrepid loan run, loan, loan exception, and portfolio exception model stubs.
- Tenant-aware model and join requirements.
- Disposable smoke schema and seeded query test.
- Sandbox schema mapping contract.
- Read-only sandbox metadata verifier.
- Docker-backed verifier for local Docker Postgres profiles.
- Cube-backed Intrepid adapter mode for local POC verification.

Next tasks:

1. Verify that a non-production Intrepid database satisfies the sandbox schema mapping contract.
2. Run the Cube sandbox profile against that database.
3. Query one tenant-scoped Intrepid run through Cube.
4. Run the Cube-backed Intrepid adapter verification.
5. Run the full factory rig in Intrepid Cube mode.
6. Decide whether the production path should read through the Intrepid API, direct Cube/Postgres models, or both.
7. Add tenant-isolation tests before user-facing or production-like use.

Exit criteria:

- A non-production Intrepid run can be loaded through Cube with explicit tenant scope.
- The adapter emits a valid `LoanProcessingRun` semantic record.
- The factory rig passes against the Cube-backed adapter mode.
- The implementation does not require production credentials or production data.

### Stage 3: Nexus CRM Context Slice

Goal: create the first user-facing CRM semantic context path without bypassing CRM authorization.

Current status: planned.

Recommended path:

1. Add a CRM semantic-context endpoint under the CRM AI route namespace.
2. Require the active authenticated user.
3. Load authorized company context using CRM service-layer rules.
4. Include related contacts, visible deals, and safe activity summaries.
5. Transform the response into an `enterprise_customer` semantic record.
6. Validate the record through the core engine.
7. Build the first GraphRAG prompt payload from verified CRM context.

Guardrails:

- Do not expose private deals to unauthorized users.
- Do not emit credentials, tokens, unrestricted custom fields, or raw sensitive activity bodies.
- Do not make direct Cube reads the user-facing path until row-level filtering and visibility rules are designed.

Exit criteria:

- A CRM company context request returns a validated semantic record.
- Private deal and org-scope authorization rules are covered by tests.
- The GraphRAG payload includes explicit lineage and redaction behavior.

### Stage 4: Answer Provenance (Answer Trace Envelope)

Goal: make every AI answer explainable after the fact: evidence, prompt shape, model calls, and, by ledger join, cost.

Current status: chartered as Popeye program POC A and owned by this repository.

Scope:

- Land the Answer Trace Envelope contract beside the semantic record contract and validate it in CI.
- Apply `sql/answer_trace_ddl.sql`; keep trace writes append-only by granting the writer role INSERT only and granting `ekg_cube_reader` SELECT.
- Implement `IAnswerTraceWriter` in the engine query path after the final model call and before answer release. Trace write failures alarm but do not block the answer path.
- Maintain `cube/model/ai_answer_traces.yml` with the `ai_token_usage` join on `primary_request_id`.
- Add `verify:trace:contract` and `verify:trace:reconciliation` to the validation gate.
- Demonstrate one CRM-style answer traced back to tenant-scoped evidence and joined cost through a governed query.

Guardrails:

- Store references and hashes only; do not store record bodies, prompt text, or completion text.
- Policy-gate `query.text` and `retrieval.cubeQuery` per feature tag; hashes are always stored.
- Treat traces as append-only. Corrections are new traces.
- Join ledger-owned facts on `primary_request_id`; do not copy model, provider, token, cost, or latency fields into the trace store.

Exit criteria:

- A GraphRAG answer produces a validated trace with at least one evidence record and a resolvable ledger join.
- The `ungrounded_answers` measure returns correct results against seeded traces, including one deliberate zero-evidence trace.
- A trace-store outage test proves answers continue, an alarm fires, and reconciliation quantifies the gap after recovery.
- Empty `policy` and `signature` slots round-trip through validation for POC B and future federation compatibility.

### Stage 5: Governed Semantic Access

Goal: apply identity-driven authorization to semantic queries so user and tenant policy controls are structural, auditable, and visible in answer traces.

Current status: chartered as Popeye program POC B and dependent on Entra-driven semantic authorization.

Scope:

- Map Entra groups to Cube security contexts.
- Enforce tenant filters as non-removable policy, starting with Intrepid's tenant dimension.
- Prove the pattern on Intrepid plus one CRM visibility rule.
- Audit allowed and denied context requests into the Stage 4 trace store by populating the `policy` block without a schema bump.

Exit criteria:

- The same question from two differently entitled identities returns correctly different evidence sets, and both outcomes are visible in traces.
- A denied request produces an audited denial, not a silent empty result.

### Stage 6: Cross-Domain GraphRAG And MVP Shared Service

Goal: turn the POC into an operational semantic context service for initial enterprise AI workflows.

Current status: future.

Required capabilities:

- Cross-domain GraphRAG over verified CRM, ledger, and Intrepid context.
- Managed Cube deployment in AWS or Azure.
- Production secret management outside source control.
- Environment-specific source configuration.
- Authorization before context retrieval and prompt construction.
- Audit traces for GraphRAG requests.
- Operational logging for validation failures, source failures, and provider failures.
- Onboarding process for future divisional integrations.

Exit criteria:

- At least one CRM assistant workflow uses verified semantic context.
- The primary context lookup meets the agreed latency target.
- A third integration can be onboarded through the documented contract and validation process.
- Runbooks exist for source connection failures, validation failures, and integration rollback.

## Open Decisions

- First managed deployment target: AWS ECS/EKS or Azure Container Apps/AKS.
- First LLM provider integration: AWS Bedrock or Azure OpenAI.
- First production latency target for CRM context lookup.
- Whether the MVP needs RDF/OWL export or Cube semantic models are enough for the first release.
- Canonical enterprise customer identity across CRM, ledger, and Intrepid.
- Retention and residency policy for Answer Trace Envelope records.
- Per-feature-tag policy registry for `query.text` and `retrieval.cubeQuery`.
- Production authorization model details for cross-divisional context beyond the Stage 5 POC.

## Current Priority

The next best engineering move is the Intrepid non-production slice. It has the most complete source-controlled contract and the clearest verification path.

In parallel, keep the Stage 1 Popeye reporting extension unblocked. After Stage 2, return to the Nexus CRM context slice, then wire that GraphRAG path into Stage 4 Answer Provenance.
