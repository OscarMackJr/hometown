# Specifications

This directory contains source-controlled specifications for the Enterprise Knowledge Graph project.

## Planning Entry Points

- [Roadmap](./ROADMAP.md)
- [Current State](./STATE.md)
- [Implementation Roadmap: New Requirements Review](./IMPLEMENTATION_ROADMAP_NEW_REQUIREMENTS_20260801.md)

## Active Specs

- [Enterprise Knowledge Graph Design Requirements v0.1](./EKG_DESIGN_REQUIREMENTS_v0.1.md)
- [Why We Are Using Cube](./WHY_CUBE_SEMANTIC_LAYER.md)
- [Nexus CRM Integration Notes v0.1](./NEXUS_CRM_INTEGRATION_NOTES_v0.1.md)
- [Intrepid Loan Engine Integration Notes v0.1](./INTREPID_LOAN_ENGINE_INTEGRATION_NOTES_v0.1.md)
- [Intrepid Sandbox Schema Mapping Contract v0.1](./INTREPID_SANDBOX_SCHEMA_MAPPING_v0.1.md)
- [Answer Trace Envelope v0.1](./ANSWER_TRACE_ENVELOPE_v0.1.md)
- [hometown Registration For POC A](./POC_A_HOMETOWN_REGISTRATION.md)
- [Tenant Isolation: Defense In Depth v0.1](./TENANT_ISOLATION_DEFENSE_IN_DEPTH_v0.1.md)
- [Retrieval Tiering And Source-System Load Budget v0.1](./RETRIEVAL_TIERING_AND_SOURCE_LOAD_v0.1.md)
- [Semantic Path Degradation Policy v0.1](./SEMANTIC_PATH_DEGRADATION_v0.1.md)
- [Answer Trace Viewer v0.1](./TRACE_VIEWER_v0.1.md)
- [Minimal Evaluation Harness v0.1](./EVAL_HARNESS_MINIMAL_v0.1.md)

## POC Scope Notes

- `FileAnswerTraceWriter` is CI/local-only and remains the default verifier path. It writes JSONL fixtures and does not provide immutable provenance. `ANSWER_TRACE_WRITER=file` or an unset writer mode selects it; `ANSWER_TRACE_FILE_PATH` overrides the JSONL path.
- `PostgresAnswerTraceWriter` is an opt-in non-production writer for the `answer_trace` table contract. Set `ANSWER_TRACE_WRITER=postgres` and `TRACE_POSTGRES_URL` to select it for the configured factory answer path. It requires a pg-compatible client at runtime; no production credentials are stored in this repo.
- `sql/answer_trace_ddl.sql` and `cube/model/ai_answer_traces.yml` are now backed by a writer mapping contract, but production immutability, retention, hosted viewer auth, and tenant-scoped trace reads remain future deployment/security work.
- The trace viewer is currently a read-only renderer/module over file-backed traces, not an authenticated hosted viewer. Entra auth and tenant-scoped trace reads apply when a server/API surface is added.
- The eval harness uses a deterministic local stub judge. Live gateway-routed LLM judging and evaluation spend attribution are not implemented yet.
