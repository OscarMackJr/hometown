# Project State

Status: Active  
Last updated: 2026-07-10  
Audience: future implementation agents and maintainers resuming work  
Primary post-read action: resume the next engineering task with the correct context and guardrails.

## Current Position

The project is in the Proof of Concept phase for a code-first Enterprise Knowledge Graph semantic layer.

The original strategy came from a Word roadmap, but the working source of truth is now Markdown:

- [Integrated Roadmap](./ROADMAP_integration_hometown.md) for current sequencing, including the Popeye-program reporting and provenance work.
- [Original Roadmap](./ROADMAP.md) for the earlier roadmap baseline.
- [Enterprise Knowledge Graph Design Requirements](./EKG_DESIGN_REQUIREMENTS_v0.1.md) for architecture and acceptance criteria.
- [Why We Are Using Cube](./WHY_CUBE_SEMANTIC_LAYER.md) for semantic-layer rationale.
- [Nexus CRM Integration Notes](./NEXUS_CRM_INTEGRATION_NOTES_v0.1.md) for CRM integration constraints.
- [Intrepid Loan Engine Integration Notes](./INTREPID_LOAN_ENGINE_INTEGRATION_NOTES_v0.1.md) for Intrepid integration constraints.
- [Intrepid Sandbox Schema Mapping Contract](./INTREPID_SANDBOX_SCHEMA_MAPPING_v0.1.md) for non-production Intrepid verification.
- [Answer Trace Envelope](./ANSWER_TRACE_ENVELOPE_v0.1.md) for the POC A answer provenance contract.

## What Exists

Core engine:

- TypeScript semantic engine with dynamic integration routing.
- Shared semantic record validation.
- Answer Trace Envelope schema and writer interface for answer provenance.
- Factory evaluation rig.
- Mock CRM and financial ledger integrations.
- Intrepid integration with mock mode and Cube-backed mode.

Cube semantic layer:

- Local Cube scaffold.
- Enterprise customer and financial ledger model placeholders.
- Tenant-aware Intrepid model stubs for loan runs, loans, loan exceptions, and portfolio exceptions.
- Answer trace Cube model for answer provenance reporting.
- Disposable local Intrepid smoke test using Postgres and Cube.
- Scaffold validation script.
- Sandbox schema verifier for Intrepid metadata.
- Docker-backed sandbox verifier for local Docker Postgres profiles.

Specs:

- EKG architecture and POC/MVP requirements are documented.
- Integrated roadmap now positions hometown as the semantic reporting and provenance tier for the Popeye program.
- CRM integration notes identify authorization boundaries and the first CRM GraphRAG slice.
- Intrepid integration notes identify tenant safety requirements and the first loan-run context slice.
- Intrepid sandbox mapping contract defines required tables, columns, joins, and verification commands.
- Answer Trace Envelope spec defines provenance records for AI answers.

SQL:

- Answer trace DDL exists for an append-only `answer_trace` store.
- The DDL documents the local `nexus` admin role, an INSERT-only trace writer role, and `ekg_cube_reader` SELECT access.

## Current Roadmap Stage

The project is between Stage 1 and Stage 2, with new Popeye-program work attached to Stage 1 and later stages:

- Stage 1, Cube semantic layer POC, is scaffolded and partially validated.
- Stage 1 extension adds Popeye spend-ledger reporting through Cube. The `ai_token_usage` Cube model is required by the integrated roadmap but is not present yet.
- Stage 2, Intrepid non-production slice, remains the active engineering slice and is the on-ramp to governed tenant access.
- Stage 3, Nexus CRM context slice, is planned but not yet implemented.
- Stage 4, Answer Provenance, is now chartered as Popeye POC A and belongs in this repository.
- Stage 5, Governed Semantic Access, is now chartered as Popeye POC B and depends on Entra-driven semantic authorization.

## Next Task

Resume with the Intrepid non-production slice while keeping the Stage 1 Popeye reporting extension unblocked.

Recommended sequence:

1. Keep the Intrepid Docker sandbox verification path green.
2. Query one tenant-scoped Intrepid run through Cube.
3. Run the Cube-backed Intrepid adapter verifier.
4. Run the factory rig in Intrepid Cube mode.
5. Add the missing `ai_token_usage` Cube model over the Popeye gateway ledger.
6. Add gateway ledger reconciliation and attribution verifiers.
7. Add trace contract and reconciliation verification for the Answer Trace Envelope.
8. Record any schema mismatch in the relevant mapping contract or update the Cube model stubs if the contract was wrong.

## Useful Commands

These commands are the normal verification path:

```bash
npm run build
npm run test:factory
npm run validate:cube
npm run smoke:cube:intrepid
npm run verify:intrepid:sandbox-mapping
npm run verify:intrepid:sandbox-mapping:docker
npm run query:cube:intrepid:sandbox
npm run verify:intrepid:cube-adapter
npm run test:factory:intrepid-cube
```

The sandbox and Cube-backed commands require local, non-production configuration. Do not add real credentials to source control.

Expected future verification commands from the integrated roadmap:

```bash
npm run verify:gateway:ledger-reconciliation
npm run verify:gateway:attribution
npm run verify:trace:contract
npm run verify:trace:reconciliation
```

These commands may not exist yet; they are roadmap obligations, not proven current commands.

## Guardrails

- Do not use production data or production credentials for the POC.
- Do not remove tenant filters from Intrepid models or queries.
- Do not make user-facing CRM GraphRAG read raw CRM tables until authorization and visibility rules are designed.
- Do not emit secrets, tokens, unrestricted custom fields, private deal activity bodies, raw workbook contents, or arbitrary server file paths into LLM prompt payloads.
- For Answer Trace Envelope records, store references and hashes, not evidence bodies, prompt text, or completion text.
- Treat `query.text` and `retrieval.cubeQuery` as policy-gated per feature tag.
- Join Popeye ledger-owned facts by `request_id`; do not copy model, token, cost, provider, or latency facts into the trace store.
- Keep traces append-only. Corrections are new traces.
- Keep semantic models, contracts, tests, and deployment definitions source-controlled.
- Keep environment-specific values in local configuration or managed secret stores.

## Popeye Boundary

hometown owns Cube models, the semantic record contract, the Answer Trace Envelope contract, GraphRAG provenance, and decisions about what evidence means.

Popeye owns the gateway, virtual keys, budgets, provider credentials, gateway infrastructure, endpoint policy, and popeye-infra Terraform.

The join between the two systems is `request_id`. Popeye writes the spend ledger. hometown reads that ledger through `ekg_cube_reader` and joins it to answer traces through `primary_request_id`.

## Local Shared Postgres Notes

The local Docker Postgres instance is shared by four applications:

- Nexus CRM.
- Intrepid loan_engine.
- sit-cip security and inventory.
- hometown Enterprise Knowledge Graph.

The `nexus` database role is the local admin and database owner for this shared instance. Some loan_engine config files may mention `postgres` or `loan_app`, but those roles do not exist in this local Docker database.

The `ekg_cube_reader` role is the read-only semantic-layer role used by hometown/Cube verification. It needs `USAGE` on the source schema and `SELECT` on the Intrepid source tables before `information_schema.columns` exposes the mapping metadata to the verifier. Its database password must match `INTREPID_POSTGRES_PASSWORD` in local `cube/.env` because Cube connects over TCP, unlike the Docker verifier's in-container `psql` path. For Cube running in Docker, `INTREPID_POSTGRES_HOST` must be `deploy-postgres-1`, not `127.0.0.1` or `localhost`.

## Known Gaps

- CRM user-facing GraphRAG endpoint is not implemented.
- CRM Cube models are still placeholder-level and need source-specific mapping.
- Ledger integration remains a placeholder and needs a real source contract.
- Popeye `ai_token_usage` Cube model is required by the integrated roadmap but is not present yet.
- Gateway ledger reconciliation and attribution verifiers are not present yet.
- Answer trace contract and reconciliation verifiers are not present yet.
- Trace writer implementation is not wired into a GraphRAG answer path yet.
- Governed semantic access through Entra groups is planned but not implemented.
- Managed cloud deployment target is undecided.
- LLM provider integration is undecided.
- GraphRAG trace retention and residency are undecided.
- Production authorization model for cross-divisional context is now scoped to Stage 5 but still undecided in detail.
- Latency target for CRM context lookup is undecided.

## Completion Definition For The Current Slice

The Intrepid non-production slice is ready to close when:

- The sandbox verifier passes against a non-production Intrepid database.
- Cube can query at least one tenant-scoped Intrepid run.
- The Cube-backed Intrepid adapter emits a valid semantic record.
- The factory rig passes in Intrepid Cube mode.
- Tenant-safety assumptions are documented or covered by tests.

The Popeye Stage 1 reporting extension is ready to close when:

- `ai_token_usage` exists as a governed Cube model over the gateway ledger.
- Chargeback queries can answer spend by application, user, model, and cloud.
- Gateway ledger reconciliation and attribution verifiers pass.
- `ekg_cube_reader` has the required read grants without expanding hometown ownership into gateway operations.

The Answer Provenance slice is ready to close when:

- The Answer Trace Envelope contract is validated in CI.
- The answer trace DDL is applied in a local or non-production store.
- `ai_answer_traces` joins to `ai_token_usage` through `primary_request_id` / `request_id`.
- Trace reconciliation detects missing traces without blocking answer delivery.

