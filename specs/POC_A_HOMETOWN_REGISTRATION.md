# hometown Registration For POC A (Answer Provenance)

Paste-ready additions. POC A is a hometown roadmap stage, not a
repository; program-level chartering remains in the ecosystem
portfolio document (POC A, section 4).

---

## Addition to specs/ROADMAP.md (after Stage 3: Nexus CRM Context Slice)

### Stage 4: Answer Provenance (Answer Trace Envelope)

Goal: make every AI answer explainable after the fact — evidence,
prompt shape, model calls, and (by ledger join) cost — via the Answer
Trace Envelope contract.

Chartered as POC A in the ecosystem portfolio (Popeye program). All
engineering lands in this repository; the popeye dependency (the
`ai_token_usage` ledger and `request_id` join key) already exists and
requires no popeye-side changes.

Source documents:

- [Answer Trace Envelope v0.1](./ANSWER_TRACE_ENVELOPE_v0.1.md) defines the schema, the four design rules, ownership, and the write path.

Recommended path:

1. Land the contract: `src/core/trace.ts` (AnswerTraceSchema beside
   SemanticRecordSchema), validated in CI like every other contract.
2. Apply `sql/answer_trace_ddl.sql`; writer role gets INSERT only
   (immutability by grant), `ekg_cube_reader` gets SELECT.
3. Implement `IAnswerTraceWriter` and wire it into the engine's query
   path: write after the final model call, before releasing the
   answer; a write failure alarms but never blocks (observation never
   blocks the request path).
4. Land `cube/model/ai_answer_traces.yml` with the `ai_token_usage`
   join.
5. Add `verify:trace:contract` (schema round-trip + cross-field
   invariants) and `verify:trace:reconciliation` (answers served vs.
   traces written) to the validation gate.
6. Demo: for one CRM-style question, the full chain from answer back
   to tenant-scoped evidence, with cost, through one governed query.

Guardrails:

- References and hashes only; no record bodies, prompt text, or
  completion text in the trace store.
- `query.text` and `retrieval.cubeQuery` are policy-gated per feature
  tag; hashes are always stored.
- Traces are append-only; corrections are new traces.
- Anything the popeye ledger owns is joined on `primary_request_id`,
  never copied; denormalized principal is the sole exception, ledger
  authoritative.

Exit criteria:

- A GraphRAG answer produces a validated trace with at least one
  evidence record and a resolvable ledger join.
- The `ungrounded_answers` measure returns correct results against
  seeded traces (including one deliberate zero-evidence trace).
- Trace-store outage test: answers continue, alarm fires,
  reconciliation quantifies the gap after recovery.
- The `policy` and `signature` slots round-trip empty (POC B / POC E
  forward-compatibility confirmed by test, not by intention).

---

## Additions to specs/STATE.md

Under "What Exists" (Specs):

- Answer Trace Envelope contract (ATE v0.1): schema spec, Zod schema,
  DDL, and `ai_answer_traces` Cube model — pending Stage 4 start.

Under "Current Roadmap Stage":

- Stage 4, Answer Provenance, is chartered (POC A, ecosystem
  portfolio) and queued behind the Stage 2/3 sequence unless the CTO
  pulls it forward after the Popeye Stage 1 demo.

Under "Known Gaps", replace:

- "GraphRAG trace storage is undecided."

with:

- GraphRAG trace storage is decided (Answer Trace Envelope, Stage 4);
  retention/residency policy and the per-feature-tag policy registry
  remain open (ATE spec section 7).
