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

### Stage 4: Cross-Domain GraphRAG Slice

Goal: combine verified context from more than one domain before prompt construction.

Current status: planned.

Candidate first business question:

> For this CRM company, what cross-divisional context changes the risk, opportunity, or servicing view?

Implementation sequence:

1. Resolve the canonical enterprise customer identity across CRM, ledger, and Intrepid where possible.
2. Retrieve authorized CRM context.
3. Retrieve ledger or Intrepid context through tenant-safe semantic records.
4. Build a compact graph context payload with relationships and source lineage.
5. Send the verified payload to the selected LLM provider.
6. Store trace metadata for audit and support.

Exit criteria:

- The prompt payload is built only from validated semantic records.
- The LLM is instructed not to invent missing fields or unsupported relationships.
- Trace metadata records which entities and relationships informed the response.

### Stage 5: MVP Shared Service

Goal: turn the POC into an operational semantic context service for initial enterprise AI workflows.

Current status: future.

Required capabilities:

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
- Storage location and retention policy for GraphRAG trace metadata.
- Production authorization model for cross-divisional context.

## Current Priority

The next best engineering move is the Intrepid non-production slice. It has the most complete source-controlled contract and the clearest verification path.

After that, return to the Nexus CRM context slice so the original CRM-centered roadmap produces a user-facing GraphRAG capability.
