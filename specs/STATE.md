# Project State

Status: Active
Last updated: 2026-08-01
Audience: future implementation agents and maintainers resuming work
Primary post-read action: resume the next engineering task with the correct context and guardrails.

## Current Position

The project is in the Proof of Concept phase for a code-first Enterprise Knowledge Graph semantic layer.

The original strategy came from a Word roadmap, but the working source of truth is now Markdown:

- [Roadmap](./ROADMAP.md) for current sequencing.
- [Enterprise Knowledge Graph Design Requirements](./EKG_DESIGN_REQUIREMENTS_v0.1.md) for architecture and acceptance criteria.
- [Why We Are Using Cube](./WHY_CUBE_SEMANTIC_LAYER.md) for semantic-layer rationale.
- [Nexus CRM Integration Notes](./NEXUS_CRM_INTEGRATION_NOTES_v0.1.md) for CRM integration constraints.
- [Intrepid Loan Engine Integration Notes](./INTREPID_LOAN_ENGINE_INTEGRATION_NOTES_v0.1.md) for Intrepid integration constraints.
- [Intrepid Sandbox Schema Mapping Contract](./INTREPID_SANDBOX_SCHEMA_MAPPING_v0.1.md) for non-production Intrepid verification.
- [Answer Trace Envelope](./ANSWER_TRACE_ENVELOPE_v0.1.md) for the original POC A provenance contract; implementation now uses ATE v0.2 fields for retrieval/degradation status.
- [hometown Registration For POC A](./POC_A_HOMETOWN_REGISTRATION.md) for the roadmap-scope registration of Answer Provenance work in this repository.
- [Implementation Roadmap: New Requirements Review](./IMPLEMENTATION_ROADMAP_NEW_REQUIREMENTS_20260801.md) for the completed Phase 1-7 pull-forward work.

## What Exists

Core engine:

- TypeScript semantic engine with dynamic integration routing.
- Shared semantic record validation.
- Retrieval tier and feature degradation policy registry.
- Governed retrieval path with timeout handling, retrieval attempts, context completeness, fail-closed behavior, and degrade-with-disclosure behavior.
- Answer Trace Envelope schema at `ate/0.2`, with top-level retrieval/degradation metadata.
- File-backed `IAnswerTraceWriter` implementation for CI/local trace verification only; it remains the default verifier path and does not provide immutable provenance.
- Opt-in non-production `PostgresAnswerTraceWriter` for the ATE v0.2 `answer_trace` table contract; it requires explicit local/env configuration and a pg-compatible client.
- Minimal traced answer path that writes ATE v0.2 traces without evidence bodies, prompt text, or answer text.
- Canonical hash helpers for questions, answers, and semantic records.
- Factory evaluation rig.
- Mock CRM and financial ledger integrations.
- Intrepid integration with mock mode and Cube-backed mode.

Cube semantic layer:

- Local Cube scaffold.
- Source-specific Nexus CRM company and first financial ledger account models.
- Tenant-aware Intrepid model stubs for loan runs, loans, loan exceptions, and portfolio exceptions.
- Answer trace Cube model for answer provenance reporting, including partial-context measures.
- Disposable local Intrepid smoke test using Postgres and Cube.
- Scaffold validation script.
- Sandbox schema verifier for Intrepid metadata.
- Docker-backed sandbox verifier for local Docker Postgres profiles.

Tenant isolation:

- Forced PostgreSQL row-level security contract for Intrepid tenant-scoped tables.
- `ekg_cube_reader` grant assertions proving non-owner, non-superuser, no `BYPASSRLS`.
- DB-backed tenant-safety verifier proving positive tenant scoping, no-filter negative isolation, and fail-closed behavior without `app.current_tenant_id`.

Trace and evaluation tools:

- Trace contract verifier for ATE v0.2.
- Trace reconciliation verifier that proves served answers write traces, deliberate missing traces are detected, and trace write failure is non-blocking.
- Read-only Answer Trace Viewer renderer/module over file-backed traces and verifier; it is not an authenticated hosted viewer.
- Minimal file-backed eval harness with seed golden questions, deterministic local stub judge, trace-id references, and cost-per-correct-answer reporting from a local ledger fixture. It does not use a live gateway-routed LLM judge or meter evaluation spend through Popeye yet.

Specs:

- EKG architecture and POC/MVP requirements are documented.
- Integrated roadmap positions hometown as the semantic reporting and provenance tier for the Popeye program.
- New requirements specs are present for tenant isolation, retrieval tiering/source load, semantic degradation, trace viewer, and minimal eval harness.
- CRM integration notes identify authorization boundaries and the first CRM GraphRAG slice.
- Intrepid integration notes identify tenant safety requirements and the first loan-run context slice.
- Intrepid sandbox mapping contract defines required tables, columns, joins, and verification commands.

SQL:

- Answer trace DDL exists for an append-only `answer_trace` store with ATE v0.2 query columns. The SQL table and Cube model have a verified non-production writer mapping, while production deployment, immutable operations, retention, and trace-read authorization remain open.
- Intrepid tenant RLS migration exists for non-production databases.
- Eval harness DDL exists as a contract artifact for `eval_run` and `eval_result`.

## Current Roadmap Stage

The Phase 1-7 pull-forward roadmap for the five new specs is implemented at CI-safe POC depth.

The project remains before production GraphRAG/authorization hardening:

- Stage 1, Cube semantic layer POC, is scaffolded and partially validated.
- Stage 1 extension adds Popeye spend-ledger reporting through Cube. The `ai_token_usage` Cube model is present; live chargeback verification still depends on a connected Popeye gateway ledger table.
- Stage 2, Intrepid non-production slice, has tenant-safety hardening in place for the local/sandbox pattern; source-owner load agreements remain a governance task.
- Stage 3, Nexus CRM context slice, is planned but not yet implemented.
- Stage 4, Answer Provenance, has a local traced answer path and verifiers. The current default writer/viewer/eval flow is file-backed and CI-safe; a non-production Postgres trace writer exists as an opt-in path. Production GraphRAG integration, immutable runtime operations, viewer auth, and tenant-scoped trace reads remain future work.
- Stage 5, Governed Semantic Access, is chartered as Popeye POC B and still depends on Entra-driven semantic authorization.

## Next Task

Recommended next engineering step: production-shape integration hardening, not another new demo surface.

1. Wire the opt-in Postgres-backed trace writer into a non-production GraphRAG answer path and run it against an applied `answer_trace` table.
2. Define production immutability, retention, hosted viewer auth, and tenant-scoped trace-read controls before presenting provenance as production runtime history.
3. Extend the CRM and ledger model set beyond the first company/account slice, especially contacts, deals, and richer ledger concepts.
4. Define production Cube session handling for `app.current_tenant_id` rather than relying on local `PGOPTIONS`.
5. Obtain source-owner retrieval/load agreement artifacts for Nexus, Intrepid, and ledger.

## Useful Commands

These commands are the normal verification path:

```bash
npm run build
npm run test:factory
npm run validate:cube
npm run verify:gateway:ledger-model
npm run query:gateway:chargeback
npm run verify:gateway:ledger-reconciliation
npm run verify:gateway:attribution
npm run verify:gateway:access
npm run smoke:cube:intrepid
npm run verify:intrepid:sandbox-mapping
npm run verify:intrepid:sandbox-mapping:docker
npm run query:cube:intrepid:sandbox
npm run verify:intrepid:cube-adapter
npm run test:factory:intrepid-cube
npm run verify:intrepid:tenant-safety
npm run verify:trace:contract
npm run verify:trace:reconciliation
npm run verify:trace:postgres-writer
npm run verify:retrieval-policy
npm run verify:trace:viewer
npm run verify:eval:harness
```

Pull-request CI runs contract-mode verifiers only: static/file-backed checks, the static Postgres trace-writer mapping check, and the disposable Intrepid Cube smoke test. Live gateway ledger checks remain opt-in via `npm run verify:gateway:ledger-model -- --live` or `GATEWAY_LEDGER_VERIFY=live`; Intrepid database-backed mapping remains opt-in via `npm run verify:intrepid:sandbox-mapping -- --live` or `npm run verify:intrepid:sandbox-mapping:docker`.

`verify:intrepid:tenant-safety` is intentionally not part of pull-request CI because it expects a pre-existing non-production Docker Postgres/container, local `cube/.env`, and explicit `INTREPID_SANDBOX_VERIFY=non-production`. Run it before releases or sandbox demos where that local database profile is available.
The sandbox and Cube-backed commands require local, non-production configuration. Do not add real credentials to source control.

The gateway verifier commands exist. `query:gateway:chargeback` and live reconciliation require a connected non-production Popeye ledger table, `public."LiteLLM_SpendLogs"`.

The configured factory trace path defaults to local JSONL output when ANSWER_TRACE_WRITER is unset or ile. For the non-production Postgres runtime path, set ANSWER_TRACE_WRITER=postgres and TRACE_POSTGRES_URL=<connection string> before running the live trace writer verifier or a configured answer path.

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

Popeye owns the gateway, virtual keys, budgets, provider credentials, gateway infrastructure, endpoint policy, and popeye-infra Terraform. hometown does not provision production CRM, ledger, gateway, or divisional database infrastructure.

The join between the two systems is `request_id`. Popeye writes the spend ledger. hometown reads that ledger through `ekg_cube_reader` and joins it to answer traces through `primary_request_id`.

## Local Shared Postgres Notes

The local Docker Postgres instance is shared by four applications:

- Nexus CRM.
- Intrepid loan_engine.
- sit-cip security and inventory.
- hometown Enterprise Knowledge Graph.

The `nexus` database role is the local admin and database owner for this shared instance. Some loan_engine config files may mention `postgres` or `loan_app`, but those roles do not exist in this local Docker database.

The `ekg_cube_reader` role is the read-only semantic-layer role used by hometown/Cube verification. It needs `USAGE` on the source schema and `SELECT` on the Intrepid source tables before `information_schema.columns` exposes the mapping metadata to the verifier. The disposable smoke schema creates `ekg_cube_reader` with the explicit local-only password `intrepid_smoke` for TCP access inside the smoke Compose profile. The reusable non-production RLS migration creates `ekg_cube_reader` as a `NOLOGIN` grant role when absent; environment-specific login users and credentials must be supplied by the owning deployment and secret-management path. For Cube running in Docker, `INTREPID_POSTGRES_HOST` must be `deploy-postgres-1`, not `127.0.0.1` or `localhost`.

Tenant-scoped Intrepid tables use forced RLS with the session setting `app.current_tenant_id`. Local single-tenant Cube profiles use `PGOPTIONS` for this POC path; production needs a per-request session-setting strategy.

## Known Gaps

- CRM user-facing GraphRAG endpoint is not implemented.
- The CRM Cube layer now maps the first `companies` slice, but contacts, deals, activities, and ref data remain future source-specific models.
- The financial ledger Cube layer now maps the first ledger account slice, but the runtime ledger integration remains mock-backed until a live source contract is wired.
- Live Popeye gateway ledger data is not connected in this workspace; `ai_token_usage` is present but live chargeback queries need `public."LiteLLM_SpendLogs"`.
- File-backed trace, viewer, and eval paths are CI-safe POC implementations only; the Postgres writer is opt-in and non-production until runtime deployment/security decisions land.
- The trace SQL DDL and Cube answer-trace model have a verified writer mapping, but production immutability, retention, hosted viewer auth, and tenant-scoped trace reads are not implemented yet.
- The trace viewer is currently a renderer/module over file-backed traces, not an authenticated hosted service; Entra auth and tenant-scoped trace reads attach when a server/API surface is added.
- The eval harness uses deterministic local stub judging; live gateway-routed judge calls and evaluation spend attribution are not implemented yet.
- Governed semantic access through Entra groups is planned but not implemented.
- Managed cloud deployment target is undecided.
- LLM provider integration is undecided.
- GraphRAG trace retention and residency are undecided.
- Production authorization model for cross-divisional context is now scoped to Stage 5 but still undecided in detail.
- Production per-request tenant session handling for Cube/Postgres RLS is undecided.
- Source-owner load agreement artifacts for Nexus, Intrepid, and ledger are not yet captured.
- Latency target for CRM context lookup is undecided.
