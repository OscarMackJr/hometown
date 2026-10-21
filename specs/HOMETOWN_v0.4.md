# Hometown v0.4 — ATE v0.4, Purpose, Definition Provenance, Source Health

Version: 0.4
Status: Draft — ATE section requires joint review with bluto and olive
Repository: hometown. Owner of gaps G2 (tracing half), G3, G5, G6.
Primary post-read action: the ATE v0.4 section is a contract change — read §2 first and schedule the joint review before any implementation.

**Prerequisite:** ATE v0.3 identity fields must be merged before v0.4 work begins. This revision extends v0.3; it does not replace it.

---

## 1. Scope

| Section | Gap | Nature |
|---|---|---|
| §2 ATE v0.4 | G2, G5 | Contract change — joint review |
| §3 Definition provenance | G5 | Implementation |
| §4 Purpose-based access and masking | G3 | Implementation, largest slice |
| §5 Source health monitoring | G6 | Implementation |
| §6 Non-goals | — | Boundary maintenance |

---

## 2. ATE v0.4 — Run Structure And Policy

Version becomes `ate/0.4`. **All additions are optional**, so single-turn answers validate unchanged.

### 2.1 `run` (optional object)

```
run: {
  runId:      uuid        // stable across every trace in one agent task
  parentRunId: uuid?      // reserved; onward delegation is refused this revision
  stepIndex:  integer     // 0-based, monotonic within the run
  stepRole:   string      // "retrieve" | "summarize" | "propose" | "answer" | ...
}
```

**Semantics.** A run is one unit of work a user asked for, however many model and tool calls it took. Absent `run`, the trace is a single-turn answer. Cost for a run is the sum of the ledger rows joined via each member trace's `primary_request_id` — no new cost field, because a cost recorded in two places will disagree.

`stepRole` is free text against a recommended list rather than an enum: constraining it now would be guessing at agent shapes we have not built.

### 2.2 `definitions` (optional object — G5)

```
definitions: {
  semanticVersion:  string   // git SHA of the semantic model set at answer time
  vocabularyVersion: string  // shared vocabulary version in force
}
```

This is the field that completes the lineage story. With it, an answer can state its definition version, its record versions, its record hashes, and its freshness — a sentence no warehouse-lineage platform assembles, because they answer "which pipeline version" and not "which definition."

### 2.3 `policy` (reserved slot, now populated — G3)

```
policy: {
  purpose:      string              // from the shared vocabulary
  principalType: string             // user | application | agent
  onBehalfOf:   string?             // present when principalType is agent
  decisions: [ {
    check:   string                 // "purpose_entitlement" | "field_mask" | "class_model" | ...
    outcome: string                 // "allow" | "deny" | "mask"
    ruleId:  string                 // versioned rule identifier
    detail:  string?                // never contains record values
  } ]
}
```

**MUST NOT:** `detail` never carries a field value, masked or otherwise. A policy record that leaks the value it masked would be a novel and embarrassing failure mode.

### 2.4 Review obligations

Joint review with **bluto** (identity field interaction) and **olive** (policy decisions and proposal linkage). Branch `contract/ate-v0.4`; PR description opens with the mandated contract-change header. **Batch G2 and G5 in this single revision** — the v0.2/v0.3 split already cost the program one avoidable disruption to its central artifact.

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-PROV-15 | A multi-step run is one auditable object with a derived total cost | TC-PROV-15 | Beat 3: three-step run, one `runId`, cost equals the sum of member ledger rows | DEMO + CI |
| REQ-PROV-16 | Every answer records the semantic definition version that produced it | TC-PROV-16 | Alter a definition, re-answer, confirm differing `semanticVersion` | CI |
| REQ-PROV-17 | Authorization decisions are recorded without record values | TC-PROV-17 | Negative test: a value appearing in `policy.detail` fails validation | CI |
| REQ-PROV-18 | v0.4 additions are absent, not empty, on single-turn answers | TC-PROV-18 | A v0.3-shaped trace validates under v0.4 | CI |

### 2.5 Trace resolution endpoint (proposed — olive request, for joint review)

Status: **Proposed.** olive requested this; hometown accepts with the amendments below. It is decided at the §2.4 joint review, alongside the open endpoint gap. Nothing here is implemented yet.

**Purpose.** olive confirms that a proposal's `trace_ref` names a hometown answer trace for the same run, tenant and agent. hometown returns facts. olive compares them and makes the decision. hometown never returns a match/no-match verdict, because that would put a policy decision inside hometown.

**Contract addition — `principal.agentId`.** The ATE has no agent identifier today. `principal` carries `appId`, `userId`, `tenantId` and `featureTag`, and §2.3 adds `principalType` and `onBehalfOf` but nothing that names the agent. v0.4 adds:

```
principal: {
  ...
  agentId: string?   // required when policy.principalType is "agent"; absent otherwise
}
```

`agentId` is the agent identity that popeye's key check returns for the session key. hometown copies it exactly and never mints, derives or reformats it, so it is the same value olive sees on the proposal (agreed with olive, §16.6).

**Endpoint.**

```
GET /v1/traces/{trace_id}/resolution

200 {
  "trace_id":       uuid,
  "schema_version": "ate/0.3" | "ate/0.4",
  "run_id":         uuid | null,     // null when the trace has no run (all v0.3 traces)
  "tenant_id":      uuid,
  "agent_id":       string | null,   // null when principalType is not "agent"
  "created_at":     timestamp
}
```

Rules:

1. **Exactly these six fields.** No envelope content, evidence, hashes or principal fields beyond those listed. `run_id` and `agent_id` are `null`, not omitted, so olive can tell "the trace predates runs" (`schema_version`) apart from "this trace had no run". For a proposal, olive treats `run_id: null` as a mismatch.
2. **Registered services only.** An unregistered caller gets `401`. A registered service whose credential carries no tenant gets `403`. Which registry this checks is open (below).
3. **Tenant from the credential, never the request.** Any tenant parameter in the path, query or body is ignored. A missing trace, a trace in another tenant, a trace with a null `tenant_id`, and a malformed `trace_id` all return the same `404` with the same body. The endpoint must not reveal whether a trace exists outside the caller's tenant.
4. **Agent answers are saved before they are returned.** For any answer where `policy.principalType` is `agent`, the trace write must commit to the store before the answer, or its trace ID, goes back to the caller. If the write fails, the answer is withheld and the caller gets an error — fail closed, no untraced agent answers. This is a ratified exception to the program's invariant 4, "observation never blocks", limited to agent answers (see "Invariant 4 exception" below). As a result, an agent can only hold a `trace_ref` that already resolves, so olive may treat a `404` as a final mismatch, not a race to retry. Traces are append-only, so olive may cache a `200` indefinitely.
5. **Enabled only on the Postgres store.** The route is served only when the configured trace store is the Postgres writer (`sql/answer_trace_ddl.sql`). With the default file-backed store, the route is not registered, and startup logs that resolution is disabled. The file store is per-process and has no database-level tenant enforcement, so it cannot back a tenant-scoped cross-service read. While resolution is disabled, olive stays on fixtures.
6. **Same read path as the trace viewer.** Resolution reads `answer_trace` through the tenant-scoped read path with database row security (`TENANT_ISOLATION_DEFENSE_IN_DEPTH_v0.1.md`): a non-owner role, `FORCE ROW LEVEL SECURITY`, tenant set on the database session. There is no second route to trace data. Prerequisite: `answer_trace` has no row-level security policy today, so adding it is part of this work, and the route stays disabled on a Postgres store that lacks it.

**Invariant 4 exception (ratified).**

| Field | Value |
|---|---|
| Decision | **Ratified.** Exception to Fiskroad cross-project invariant 4, "observation never blocks" (`fiskroad/STATE.md`) |
| Date | 2026-10-20 |
| Ratified by | Oscar Mack (architecture and risk decisions) |
| Scope | Only §2.5 rule 4: answers where `policy.principalType` is `agent`. A failed trace write withholds the answer and its trace ID |
| Not in scope | User and application answers. Their trace writes stay non-blocking and must never fail a request. Other observation components (ledger, monitoring, source health §5) are unchanged |
| Reason | An agent must never hold a `trace_ref` that does not resolve. Otherwise olive cannot tell a forged or mistaken reference from a trace that was never saved, and every agent proposal is unverifiable |
| Change control | Widening the scope to any other principal type or component needs a new ratification. Tests TC-PROV-23 and TC-PROV-26 guard the boundary |

**Interim (olive).** Until this endpoint is live in olive's environment, olive checks `trace_ref` against fixtures and labels every proposal `trace_verification: fixture`. hometown suggests olive make `trace_verification` a fixed set of values (`fixture | verified | mismatch`) and not let `fixture` proposals go past non-production. The values and the gate are olive's to decide.

**Open for the review.**

- **Service registry owner.** hometown proposes popeye or the Entra app registrations, not hometown.
- **Ships with the answer endpoint (agreed with olive, §16.6).** hometown serves no HTTP today. Resolution ships in the same release and service as the answer endpoint Liam needs. That endpoint is where rule 4 is enforced, so the two cannot be split. The answer endpoint is not yet specified in hometown and needs its own section before implementation. The viewer's tenant-scoped reads (`STATE.md`, future work) join the same service.

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-PROV-19 | Resolution returns exactly six fields, with null `run_id`/`agent_id` when absent | TC-PROV-19 | Response key set equals the six fields exactly; a v0.3 trace returns `schema_version: ate/0.3`, `run_id: null` | CI |
| REQ-PROV-20 | Tenant comes only from the caller's credential; out-of-scope traces return 404 | TC-PROV-20 | Missing, other-tenant, null-tenant and malformed IDs return the same 404 status and body; a supplied tenant parameter has no effect | CI |
| REQ-PROV-21 | Only registered services may call resolution | TC-PROV-21 | Unregistered credential → 401; registered credential with no tenant → 403 | CI |
| REQ-PROV-22 | Agent traces name their agent | TC-PROV-22 | `principalType: agent` without `agentId` fails validation; `agentId` on a non-agent trace fails validation; `agentId` equals, byte for byte, the identity popeye's key check returned for that request | CI |
| REQ-PROV-23 | An agent answer is never returned before its trace is saved | TC-PROV-23 | Injected writer failure → answer withheld, error returned; on success, resolution returns 200 for the `trace_ref` as soon as the answer is received | CI |
| REQ-PROV-24 | Resolution is enabled only on the Postgres trace store | TC-PROV-24 | File-backed store → route not registered and startup logs it as disabled; Postgres store without forced row-level security on `answer_trace` → route not registered; Postgres store with it → route served | CI |
| REQ-PROV-25 | Resolution inherits database tenant enforcement | TC-PROV-25 | With the application-level tenant filter removed in a test setup, resolution still returns 404 for another tenant's trace (mirrors TC-TEN-01) | CI |
| REQ-PROV-26 | Trace writes block only agent answers (invariant 4 exception boundary) | TC-PROV-26 | Injected writer failure on a user or application answer: answer still returned, write failure logged; on an agent answer: answer withheld (TC-PROV-23) | CI |

---

## 3. Definition Provenance (G5)

Capture the semantic model set's git SHA at query time and stamp it into every trace. Implementation notes: read it once at process start and on config reload rather than per request; if the working tree is dirty, record the SHA plus a `-dirty` marker — a trace that silently claims a clean version is worse than one that admits it cannot.

---

## 4. Purpose-Based Access And Masking (G3)

The largest slice of this revision.

### 4.1 Declaration

Each entity type declares, per purpose, a field policy:

| Field treatment | Meaning |
|---|---|
| `full` | Value as stored |
| `bucketed` | Range or band instead of the value (`balance` → `50k-100k`) |
| `redacted` | Presence signalled, value withheld |
| `absent` | Field not returned; its existence not disclosed |

Undeclared field/purpose pairs default to `absent`. Deny by default, again — and note it is stronger here than elsewhere: an undeclared field does not merely fail closed, it does not admit to existing.

### 4.2 Enforcement

Purpose arrives from the virtual key (authoritative) and may be asserted in the request (advisory). Entitlement to the purpose is checked against directory group membership. Masking is applied in the retrieval path before context assembly, so **no unmasked value ever enters a prompt.** This is the ordering requirement — masking after assembly would be theatre.

Every decision lands in `policy.decisions` (§2.3).

### 4.3 The interaction with tenant isolation

Purpose is a **third** control, layered on the two existing isolation layers, not a replacement for either. A purpose check must never be able to widen tenant scope. Test this explicitly: a `compliance-review` purpose, which is the broadest, must still be tenant-scoped.

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-PUR-01 | The same user and entity yield different fields under different purposes | TC-PUR-01 | Beat 1 demonstration | DEMO + CI |
| REQ-PUR-02 | Undeclared field/purpose pairs return `absent` | TC-PUR-02 | Negative test on an undeclared field | CI |
| REQ-PUR-03 | Masking occurs before context assembly | TC-PUR-03 | Trace evidence and prompt shape contain no unmasked regulated value | CI |
| REQ-PUR-04 | Purpose cannot widen tenant scope | TC-PUR-04 | `compliance-review` under tenant A returns no tenant B rows | CI |
| REQ-PUR-05 | Purpose entitlement derives from directory groups, not from the request | TC-PUR-05 | Request asserting an unentitled purpose is refused | CI |

---

## 5. Source Health Monitoring (G6)

A3's trigger — "a second real source is read" — fires in POC-2.

**Mechanism:** for each integration, snapshot the expected contract (table, column, type, nullability) into source control. A scheduled job compares the snapshot to live `information_schema` and alarms on any divergence, naming the source and the specific column.

This is the same artifact-versus-reality pattern as hometown's live verifier modes, applied on a schedule instead of at build time — the direct descendant of the tautological-verifier lesson.

**Deliberately excluded:** row-level data quality expectations (volume, distribution, null rates). Schema drift breaks answers silently; data quality is a divisional concern with a divisional owner. Say so rather than half-building it.

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-SRC-01 | Each integration has a version-controlled contract snapshot | TC-SRC-01 | Snapshot present for all three integrations | CI |
| REQ-SRC-02 | Drift alarms before any answer degrades | TC-SRC-02 | Beat 5: staged column rename alarms with the column named, no answer degradation observed first | DEMO |

---

## 6. Non-Goals For This Revision

- **No write path.** hometown proposes actions; it never executes them and never holds a write credential (REQ-PGM-01). Proposals go to olive.
- **No search or discovery.** Query only, as before.
- **No embeddings or vector store.** If one is proposed, the classification rule in the program charter applies first.
- **No document retrieval.** POC-2 decides POC F; hometown does not build it.
- **No agent orchestration.** hometown produces traces for agent steps; it does not run agents.
