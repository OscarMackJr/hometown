# Hometown v0.4 — ATE v0.4, Purpose, Definition Provenance, Source Health

Version: 0.4
Status: Draft — §2 requires joint review with bluto and olive; §2.5–§2.6 also with the Liam owner and popeye. Independent reviewer for the Liam/olive contract: James O'Meara.
Repository: hometown. Owner of gaps G2 (tracing half), G3, G5, G6.
Primary post-read action: the ATE v0.4 section is a contract change — read §2 first and schedule the joint review before any implementation.

**Changes 2026-10-21 (review follow-up):** §2.5 amendment paragraph updated to olive's ratified v0.5.2 §17; Liam's exit reasons for other 4xx now come from the error code (one-line Liam change, recorded in §2.6); introspection-cache note; two items added to §2.5's "Open for the review" (`ate/0.2` traces, program-level record of the invariant 4 exception) and two to §2.6's (feature tag naming, source of `appId`/`featureTag`); reviewers named in the status line.

**Prerequisite:** ATE v0.3 identity fields must be merged before v0.4 work begins. This revision extends v0.3; it does not replace it.

---

## 1. Scope

| Section | Gap | Nature |
|---|---|---|
| §2 ATE v0.4 | G2, G5 | Contract change — joint review |
| §2.5–§2.6 Trace resolution and agent answer endpoints | G5, G6 | Contract change — joint review, plus the Liam owner and popeye |
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

**Amended 2026-10-20** for olive's decision record v0.5.2 §17 (`DECISION_olive-poc2-phase1`), ratified 2026-10-20. hometown agrees to all four §17.5 requests: `proposalHash`, tenant-scoped service tokens, hashing the returned proposal, and the `trace_verification` values. olive's tokens use `principal_type = application`; this section names no principal type and is unaffected. Any later change to §17's requests needs hometown's agreement and olive's re-ratification.

**Purpose.** olive confirms that a proposal's `trace_ref` names a hometown answer trace for the same run, tenant and agent. hometown returns facts. olive compares them and makes the decision. hometown never returns a match/no-match verdict, because that would put a policy decision inside hometown.

**Contract addition — `principal.agentId`.** The ATE has no agent identifier today. `principal` carries `appId`, `userId`, `tenantId` and `featureTag`, and §2.3 adds `principalType` and `onBehalfOf` but nothing that names the agent. v0.4 adds:

```
principal: {
  ...
  agentId: string?   // required when policy.principalType is "agent"; absent otherwise
}
```

`agentId` is the agent identity that popeye's key check returns for the session key. hometown copies it exactly and never mints, derives or reformats it, so it is the same value olive sees on the proposal (agreed with olive, §16.6).

**Contract addition — `answer.proposalHash`** (olive §17.2). This binds a submitted proposal to the trace. Without it, an agent could alter a proposal and still present a valid `trace_ref`.

```
answer: {
  ...
  proposalHash: string | null   // agent answers only; absent otherwise
}
```

- **Value.** Lowercase hex SHA-256 over the RFC 8785 (JCS) canonical form of the proposal object, with exactly four keys: `action_type`, `party_ref`, `parameters`, `justification`. This is the program's single canonicalization rule (olive §15.3 and the ATE signing target).
- **What is hashed.** The proposal object hometown actually returns in the §2.6 response, after its shape check, never the model's raw output. Nothing changes the proposal between the shape check, the hash and the response: no masking, redaction, coercion or reformatting. Masking happens before context assembly (§4.2), so it never touches the proposal afterwards.
- **`null`.** The answer carries no proposal, or hometown dropped one on shape (`proposal_shape` `deny`).
- **Absent** on non-agent answers (REQ-PROV-18).

**Endpoint.**

```
GET /v1/traces/{trace_id}/resolution

200 {
  "trace_id":       uuid,
  "schema_version": "ate/0.3" | "ate/0.4",
  "run_id":         uuid | null,     // null when the trace has no run (all v0.3 traces)
  "tenant_id":      uuid,
  "agent_id":       string | null,   // null when principalType is not "agent"
  "proposal_hash":  string | null,   // answer.proposalHash; null when absent or null in the trace
  "created_at":     timestamp
}
```

Rules:

1. **Exactly these seven fields.** No envelope content, evidence, or hashes other than `proposal_hash`, and no principal fields beyond those listed. `run_id` and `agent_id` are `null`, not omitted, so olive can tell "the trace predates runs" (`schema_version`) apart from "this trace had no run". For a proposal, olive treats `run_id: null` as a mismatch.
2. **Registered services only, through popeye's tenant-scoped service tokens** (olive §17.1).
   - The credential is a short-lived service token that popeye issues to a registered service for one tenant. hometown introspects it at popeye, caching a positive result for at most 60 s and never past its expiry, as for agent keys.
   - Missing, invalid or expired token, or a caller popeye does not recognise as a registered service → `401`.
   - A token without a `tenant_id` → `403`.
   - This is how olive, which serves every tenant under an untenanted identity of its own, can call at all: it gets a token per tenant from popeye.
   - Session keys are not accepted here. olive never forwards an agent's key (olive §17.1 item 2).
3. **Tenant from the credential, never the request.** The tenant is the token's `tenant_id`, and hometown reads nothing else from the token for scoping. A `delegated_agent_id` claim on the token is for olive's own check and does not narrow or widen what hometown returns. Any tenant parameter in the path, query or body is ignored. A missing trace, a trace in another tenant, a trace with a null `tenant_id`, and a malformed `trace_id` all return the same `404` with the same body. The endpoint must not reveal whether a trace exists outside the caller's tenant.
4. **Agent answers are saved before they are returned.** For any answer where `policy.principalType` is `agent`, the trace write must commit to the store before the answer, or its trace ID, goes back to the caller. If the write fails, the answer is withheld and the caller gets an error — fail closed, no untraced agent answers. This is a ratified exception to the program's invariant 4, "observation never blocks", limited to agent answers (see "Invariant 4 exception" below). As a result, an agent can only hold a `trace_ref` that already resolves. olive still treats a `404` as retryable and does not store it (olive §16.3); that is safe either way. Traces are append-only, so olive may cache a `200` indefinitely.
5. **Postgres store only; otherwise the server refuses to start** (olive §16.6 item 3). The HTTP server that serves this endpoint and §2.6 refuses to start unless the trace store is the Postgres writer (`sql/answer_trace_ddl.sql`) with forced row-level security on `answer_trace` (rule 6). It exits with a reason line; it does not start without the routes. CLI and CI flows that use the file-backed store don't start this server and are unaffected. The file store is per-process and has no database-level tenant enforcement, so it cannot back a tenant-scoped cross-service read. Until the server runs, olive stays on fixtures.
6. **Same read path as the trace viewer.** Resolution reads `answer_trace` through the tenant-scoped read path with database row security (`TENANT_ISOLATION_DEFENSE_IN_DEPTH_v0.1.md`): a non-owner role, `FORCE ROW LEVEL SECURITY`, tenant set on the database session. There is no second route to trace data. Prerequisite: `answer_trace` has no row-level security policy today, so adding it is part of this work. Under rule 5, the server refuses to start on a Postgres store that lacks it.

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

**Interim (olive).** Until this endpoint is live in olive's environment, olive checks `trace_ref` against fixtures. Every proposal records `trace_verification`, using olive's ratified values (olive §16.5):
- `fixture` — checked against fixtures;
- `hometown` — checked against this endpoint.

The value records where the check came from; how it turned out is olive's refusal reason. With `OLIVE_ENVIRONMENT=production`, olive refuses to start if the fixture resolver is configured, and a `fixture` proposal can never be approved for real execution.

**Open for the review.**

- **Service registry and tokens — popeye (olive §17.1).** popeye owns:
  - the service registry, scoped by tenant and agent;
  - issuing tenant-scoped service tokens, deriving `tenant_id` and `delegated_agent_id` from a presented agent session key, with expiry capped at the key's;
  - introspection of those tokens, with hometown as a registered introspection caller.

  Until popeye implements this, nobody can call resolution and olive stays on fixtures.
- **`ate/0.2` traces.** `schema_version` allows only `ate/0.3 | ate/0.4`, but the repository is at `ate/0.2` today. The review decides one of: (a) state that no `ate/0.2` traces can exist in the Postgres store when the server first starts (the v0.3 prerequisite lands first, and the store is created fresh), with a startup check that refuses to start if any are found; or (b) extend the enum to `ate/0.2`, which returns `run_id`, `agent_id` and `proposal_hash` as `null`. hometown's recommendation is (a).
- **Program-level record of the invariant 4 exception.** The exception above is ratified but recorded only here. `fiskroad/STATE.md` needs a line next to invariant 4 pointing to this section and to olive's decision record §16.6, so nobody reading the invariant misses its exception. Owner: fiskroad maintainer; confirm at the review.
- **Ships with the answer endpoint (agreed with olive, §16.6).** hometown serves no HTTP today. Resolution ships in the same release and service as the answer endpoint Liam needs. That endpoint is where rule 4 is enforced, so the two cannot be split. The answer endpoint is specified in §2.6. The viewer's tenant-scoped reads (`STATE.md`, future work) join the same service.

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-PROV-19 | Resolution returns exactly seven fields, with null `run_id`/`agent_id`/`proposal_hash` when absent | TC-PROV-19 | Response key set equals the seven fields exactly; a v0.3 trace returns `schema_version: ate/0.3`, `run_id: null`, `proposal_hash: null` | CI |
| REQ-PROV-20 | Tenant comes only from the caller's credential; out-of-scope traces return 404 | TC-PROV-20 | Missing, other-tenant, null-tenant and malformed IDs return the same 404 status and body; a supplied tenant parameter has no effect | CI |
| REQ-PROV-21 | Only registered services may call resolution | TC-PROV-21 | Against a popeye stub: unrecognised, invalid or expired service token → 401; token without `tenant_id` → 403; agent session key → 401; a valid token for tenant A returns tenant A traces only, whatever its `delegated_agent_id` | CI |
| REQ-PROV-22 | Agent traces name their agent | TC-PROV-22 | `principalType: agent` without `agentId` fails validation; `agentId` on a non-agent trace fails validation; `agentId` equals, byte for byte, the identity popeye's key check returned for that request | CI |
| REQ-PROV-23 | An agent answer is never returned before its trace is saved | TC-PROV-23 | Injected writer failure → answer withheld, error returned; on success, resolution returns 200 for the `trace_ref` as soon as the answer is received | CI |
| REQ-PROV-24 | The resolution and answer server runs only on the Postgres trace store with row-level security | TC-PROV-24 | File-backed store → server refuses to start, with a reason line; Postgres store without forced row-level security on `answer_trace` → refuses to start; Postgres store with it → starts and serves both routes | CI |
| REQ-PROV-25 | Resolution inherits database tenant enforcement | TC-PROV-25 | With the application-level tenant filter removed in a test setup, resolution still returns 404 for another tenant's trace (mirrors TC-TEN-01) | CI |
| REQ-PROV-26 | Trace writes block only agent answers (invariant 4 exception boundary) | TC-PROV-26 | Injected writer failure on a user or application answer: answer still returned, write failure logged; on an agent answer: answer withheld (TC-PROV-23) | CI |
| REQ-PROV-27 | The trace binds the proposal it returned | TC-PROV-27 | `answer.proposalHash` equals the JCS SHA-256 of the four-key proposal in the §2.6 response, and resolution returns it as `proposal_hash`; it is `null` with no proposal or a dropped one, and absent on non-agent traces; reordering keys or whitespace in `parameters` gives the same hash | CI |

### 2.6 Agent answer endpoint (proposed — confirms Liam's S-HT-1, for joint review)

Status: **Proposed.** This confirms Liam's stub contract S-HT-1 (`LIAM_DESIGN_SPEC_v0.4` §5, `liam/contracts/hometown-answer.S-HT-1.json`). The changes are listed field by field below. Once agreed, it closes Liam checkpoint item A1.

Reviewers, joining the §2.4 joint review:
- the Liam owner (wire shape)
- popeye (introspection and relay use)
- olive (proposal shape)

It ships in the same release and service as §2.5.

**What it does.** One request produces one traced answer. hometown:
1. authenticates the agent's session key through popeye introspection;
2. checks purpose entitlement;
3. assembles purpose-masked context;
4. makes the model call on the session key as the registered relay;
5. saves the trace;
6. only then returns the answer and its trace ID.

The agent never sees context, masked or unmasked — only the answer.

#### Changes to S-HT-1

Every S-HT-1 field is kept with its name and meaning. Only these change:

| Field or element | S-HT-1 | §2.6 | Why |
|---|---|---|---|
| `question` | string, no bound | 1..4000 characters; outside the bound → `400 invalid_request` | Bounds prompt size and cost |
| Request parsing | Unspecified | Strict: a missing or unknown field → `400 invalid_request` | Identity cannot be slipped in through the body |
| `purpose` | Advisory; key authoritative | Unchanged, now explicit: the key decides, and a differing body value is recorded, never refused | Keeps the body from affecting the outcome either way |
| `run_id` | UUIDv7 | Any lowercase canonical UUID (Liam's UUIDv7 qualifies); a run is scoped to the key's tenant | Run lookups go through the tenant-scoped read path |
| `proposal` | At most one; Liam ignores extras | hometown sends at most one and checks its shape | The guarantee moves to the producer |
| Error body | Unspecified | `{"error": "<code>"}` with the §5.4 codes | Liam's reason strings come from the code |
| Liam's exit reason for other 4xx | `hometown:<status>` | `hometown:<code>` (for example `hometown:party_not_found`) | Two 422s would otherwise be indistinguishable. **One-line Liam change** to `LIAM_DESIGN_SPEC_v0.4` §5.4; exit codes unchanged |

Unchanged: `party_ref`, `nono_session_id`, `step_role`, `trace_id`, `answer`, `context_complete`, and Liam's §5.4 status handling (which statuses retry, and the exit codes). Only the reason string for other 4xx changes.

#### Request

```
POST /v1/agent/answer
Content-Type: application/json

{
  "party_ref":       string,  // opaque party reference
  "question":        string,  // 1..4000 characters
  "purpose":         string,  // advisory; the key's purpose decides
  "run_id":          uuid,    // lowercase canonical; Liam sends UUIDv7; scoped to the key's tenant
  "nono_session_id": string,  // from the nono receipt
  "step_role":       string   // "answer" for Liam; free text per §2.1
}
```

All six fields are required. A missing field, an unknown field, or a field outside its bound returns `400 invalid_request`. Identity never comes from the body, so a body that tries to supply it is rejected rather than ignored.

#### Authentication

The agent sends no `Authorization` header; nono-proxy injects the session agent key. hometown:

1. Reads the injected key. If there is none, it returns `401 no_injected_key`.
2. Introspects the key at popeye as a registered introspection caller (`POPEYE_v0.4.2` §2.3). If the key is inactive (`active: false`), it returns `401 key_inactive`. Popeye reports any non-agent key as `active: false`, so user and application keys also get `401 key_inactive`. A positive result is cached for at most 60 s and never past `expires_at`. The cache never lets a revoked key reach a model: the gateway checks the key again on the relayed call.
3. Never logs or stores the key. It presents the key only to the gateway, as the registered relay (`POPEYE_v0.4.2` §2.6), and never to the exchange.

#### Identity

Every identity field in the trace comes from introspection or from hometown's own registration, never from the request:

| ATE field | Source |
|---|---|
| `principal.agentId` | introspection `agent_id`, copied exactly (§2.5) |
| `principal.tenantId` | introspection `tenant_id` |
| `principal.userId`, `policy.onBehalfOf` | introspection `on_behalf_of` |
| `policy.principalType` | `"agent"` |
| `policy.purpose` | introspection `purpose` |
| `principal.appId`, `principal.featureTag` | hometown's agent registration for `agent_id` (below) |
| `endpoint.keyId` | introspection `key_id` |

**Agent registration (new).** hometown keeps a version-controlled registration for each `agent_id`, holding its `appId`, `featureTag` and degradation mode. An `agent_id` with no registration returns `422 agent_not_registered`. It is deliberately not a 403, because Liam reads 403 as a purpose refusal. Liam's registration:
- uses `degrade_with_disclosure`, because Liam shows a notice when `context_complete=false` (`LIAM_DESIGN_SPEC_v0.4` §5.5);
- proposes the feature tag `liam.summarise-propose`, with the name to be agreed at review.

#### Purpose checks

These run before any context retrieval or model call. The key's purpose is the only purpose checked or applied.

1. **Body purpose (advisory).** If the request's `purpose` differs from the key's, the request continues under the key's purpose. The difference is recorded in `policy.decisions` as check `purpose_advisory`, outcome `allow`, with the two purpose names in `detail`. Purpose names are vocabulary values, not record values.
2. **Entitlement.** The `on_behalf_of` user is not entitled to the key's purpose through directory groups (REQ-PUR-05), or the agent's own entitlement does not include it → `403 purpose_refused`. The agent's effective permissions are the intersection of its own and the user's (`vocabulary.yaml` `agent_delegation`).

`403 purpose_refused` is the only 403 this endpoint returns. Passing checks are recorded in `policy.decisions`. A refused request makes no model call, and an ATE requires one, so a refusal writes no trace. Instead it is recorded as a content-free refusal event: `agent_id`, `key_id`, `run_id`, the check that failed, `ruleId` and time.

#### Runs

A run is identified by `(tenant_id, run_id)`, not by `run_id` alone. Run lookups go through the same tenant-scoped, row-level-security read path as §2.5, so hometown cannot see another tenant's runs and never tries to.

| Condition, within the key's tenant | Result |
|---|---|
| `run_id` not seen before | New run; `stepIndex = 0` |
| `run_id` seen before, same agent | Next `stepIndex` |
| `run_id` seen before, different agent | `409 run_conflict`; nothing written |

The conflict rule stops one agent attaching steps to another agent's run. The same `run_id` used in another tenant is a separate run there, invisible from here. Detecting that would need a read across tenants, and a 409 would reveal that the run exists elsewhere. `parentRunId` is never set, because onward delegation is refused (§2.1).

#### Party

`party_ref` is resolved within the key's tenant only. An unknown party and another tenant's party both return the same `422 party_not_found`, so the endpoint cannot reveal whether a party exists elsewhere.

#### Context, model call and trace

- Masking happens before context assembly (§4.2).
- **Model choice.** hometown requests a model that popeye's model-approval registry approves for the key's data-class ceiling, or leaves the choice to popeye. It never requests a model above the ceiling. Prompt templates and parsing the model's output are also hometown's (`LIAM_DESIGN_SPEC_v0.4` §6).
- The model call is made on the session key with hometown's relay identity (`POPEYE_v0.4.2` §2.6), so the ledger row carries `relayed_by=hometown`, the agent fields and the key's `key_id`.
- **Which model answered.** The trace does not copy the model. It records `primaryRequestId`, and the model, tokens and cost are read from the ledger through that join (ATE design rule 1, join, never copy).
- **Tying spend to the run.** Spend reaches Liam's run through the trace: `run.runId` → member traces → `primaryRequestId` → ledger rows (§2.1). No `run_id` is added to the ledger row; that would change the shared attribution vocabulary (Fiskroad invariant 2).
- The trace carries the identity fields above, `run { runId, stepIndex, stepRole }`, `definitions` (§2.2), `answer.proposalHash` (§2.5) and `endpoint` (below). It is saved before the response, per §2.5 rule 4.

**`endpoint` object (proposed ATE addition — gap G6, Liam O2).**

```
endpoint: {
  sessionId: string   // nono_session_id as sent by the agent; asserted, not verified
  keyId:     uuid     // from introspection; verified
}
```

The object is optional and present on agent answers.
- `keyId` is the authoritative join to nono's receipts and popeye's ledger (`POPEYE_v0.4.3` REQ-AGT-21).
- `sessionId` is a convenience field. The agent asserts it and hometown cannot verify it.
- Neither field carries content.

#### Response

```
200 {
  "trace_id":         uuid,
  "answer":           string,
  "context_complete": boolean,
  "proposal":         null | {
    "action_type":   string,   // matches action_id_format
    "party_ref":     string,   // equals the request's party_ref
    "parameters":    object,
    "justification": string
  }
}
```

- `trace_id` is already saved, and resolvable through §2.5, when this response is sent.
- `proposal` is always present and `null` when there is none. hometown sends at most one.
- hometown generates the proposal; Liam submits it to olive with `trace_id` as `trace_ref` (`LIAM_DESIGN_SPEC_v0.4` D6). hometown never calls olive and never holds an olive credential.
- hometown checks only a proposal's shape: exactly the four keys shown, `action_type` matching `action_id_format`, and `party_ref` equal to the request's. A proposal that fails is dropped (`proposal: null`) and recorded in `policy.decisions` as check `proposal_shape`, outcome `deny`. Whether an action is permitted is olive's decision, not hometown's.
- **Binding.** The proposal returned here is exactly the object hashed into `answer.proposalHash` (§2.5). olive recomputes the hash over what Liam submits (olive §17.2). Liam must forward the four fields unchanged, which it already does (`LIAM_DESIGN_SPEC_v0.4` §7.2).
- `parameters` and `justification` are model output built from masked context, so they can contain only values the purpose allowed. hometown never unmasks a value for a proposal.
- `answer` and `justification` are display text only.

#### Errors

Every error body is `{"error": "<code>"}` with nothing else. Statuses follow `LIAM_DESIGN_SPEC_v0.4` §5.4 exactly: 401 is a key problem, 403 is only a purpose refusal, other 4xx fail without retry, and 5xx is retried once. Liam's one change is to build its exit reason from the code rather than the status, so an operator can tell the two 422s apart.

| Status | Code | When | Liam (§5.4) |
|---|---|---|---|
| 401 | `no_injected_key` | No key injected | Exit 21 `hometown:no_injected_key`, no retry |
| 401 | `key_inactive` | Introspection `active: false`, including any non-agent key | Exit 21 `hometown:key_inactive`, no retry |
| 403 | `purpose_refused` | Entitlement check fails | Exit 20 `hometown:purpose_refused`, no retry |
| 400 | `invalid_request` | Missing, unknown or out-of-bound field | Exit 21 `hometown:invalid_request`, no retry |
| 409 | `run_conflict` | `run_id` belongs to another agent in this tenant | Exit 21 `hometown:run_conflict`, no retry |
| 422 | `agent_not_registered` | No registration for `agent_id` | Exit 21 `hometown:agent_not_registered`, no retry |
| 422 | `party_not_found` | Party unknown in the key's tenant | Exit 21 `hometown:party_not_found`, no retry |
| 503 | `trace_not_saved` | Trace save failed; answer withheld (§2.5 rule 4) | One retry; then exit 21 `hometown:unavailable` |
| 503 | `context_unavailable` | Context incomplete under `fail_closed` | One retry |
| 503 | `unavailable` | popeye, gateway or a source unreachable | One retry |
| 504 | `deadline` | hometown's 80 s budget exceeded | One retry |

- **Deadline.** Liam's timeout is 90 s, and the whole request fits inside it. hometown sets its own deadline at 80 s, so it finishes or returns `504 deadline` before Liam gives up. If both used 90 s they would race, and Liam would record a bare timeout instead of a reason code. The 10 s margin covers transit through nono-proxy.
- **Retries.** A retry is a new step with the next `stepIndex`. If an attempt fails after its model call, the call stays in the ledger as an agent-attributed row with no trace. Reconciliation shows it as a ledger row with no matching trace; nothing hides it.

#### Enablement

**Shared server.** The answer endpoint and §2.5 resolution are served by the same HTTP server, in the same release. That server is also the planned home of the trace viewer's tenant-scoped reads. Every read of `answer_trace`, whether resolution, run lookup or step index, goes through one tenant-scoped read path:
- a non-owner role;
- `FORCE ROW LEVEL SECURITY` on `answer_trace`;
- the tenant set on the database session from the key's `tenant_id`.

No route has its own way into trace data.

**Enablement.** The answer endpoint and §2.5 resolution run on the same server, which refuses to start without the Postgres store and forced row-level security (§2.5 rule 5). So an agent can never receive a `trace_ref` that olive cannot resolve.

#### Open for review

- The `featureTag` name, and where agent registrations live. The existing convention uses underscores (`crm.deal_summary`), so `liam.summarise_propose` rather than the hyphen proposed above.
- **Where `principal.appId` and `principal.featureTag` come from.** They are taken from hometown's agent registration (Identity, above), but ATE principal fields mirror the ledger's attribution vocabulary, and the ledger is authoritative on conflict. If popeye's ledger row for an agent key records a different app, the two drift. The review chooses: take both from popeye's key metadata (introspection), or keep the registration and add a test that it matches the ledger row for the same request (alongside TC-AGA-12). Liam's TC-E2E-05 depends on what the ledger records for agent rows.
- Whether refused requests should produce traces, which would need an ATE shape without a model call.

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-AGA-01 | Agent identity comes only from introspection | TC-AGA-01 | A body with an identity field is rejected 400; trace principal and policy fields equal the introspection values byte for byte | CI |
| REQ-AGA-02 | Only active agent keys are served | TC-AGA-02 | No key → 401 `no_injected_key`; inactive key → 401 `key_inactive`; user or application key → 401 `key_inactive` | CI |
| REQ-AGA-03 | The key's purpose decides; refusals happen before retrieval and the model call | TC-AGA-03 | Unentitled purpose → 403 `purpose_refused`, zero source reads, zero gateway calls, one refusal event. A differing body purpose → 200 under the key's purpose, with a `purpose_advisory` decision recorded | CI |
| REQ-AGA-04 | A run is tenant-scoped and belongs to one agent | TC-AGA-04 | A second agent in the same tenant reusing a `run_id` → 409, nothing written. The same `run_id` in another tenant starts a separate run with `stepIndex` 0 and no 409 | CI |
| REQ-AGA-05 | Steps in a run are indexed in order | TC-AGA-05 | Three requests on one `run_id` record `stepIndex` 0, 1, 2 | CI |
| REQ-AGA-06 | Unknown and other-tenant parties look the same | TC-AGA-06 | Both return identical 422 status and body | CI |
| REQ-AGA-07 | An answer is returned only once its trace resolves | TC-AGA-07 | The response's `trace_id` resolves 200 through §2.5 at once (with TC-PROV-23) | CI |
| REQ-AGA-08 | At most one proposal, structurally valid | TC-AGA-08 | Model output with two proposals, a bad `action_type`, another party's `party_ref`, or a fifth key yields at most one valid proposal; each dropped one is recorded as `proposal_shape` `deny`, and a drop sets `proposalHash` to `null` | CI |
| REQ-AGA-09 | The endpoint link is recorded | TC-AGA-09 | `endpoint.keyId` equals introspection `key_id`; `endpoint.sessionId` equals the request's `nono_session_id` | CI |
| REQ-AGA-10 | The endpoint is served only when resolution is | TC-AGA-10 | File store, or Postgres without forced row-level security → the server refuses to start (with TC-PROV-24) | CI |
| REQ-AGA-11 | Error bodies carry a code and nothing else | TC-AGA-11 | Every error response body has exactly one key, `error`, with a listed code. The only 403 code is `purpose_refused` | CI |
| REQ-AGA-12 | Model calls are relayed on the session key | TC-AGA-12 | The ledger row has `relayed_by=hometown`, the agent fields and the same `key_id`; the trace's `primaryRequestId` joins it | CI (live) |
| REQ-AGA-13 | The model is approved for the key's data-class ceiling | TC-AGA-13 | Under a key with a lower ceiling, the joined ledger row's model is one the registry approves for that ceiling; no request names a model above it | CI (live) |
| REQ-AGA-14 | Answer and resolution share one tenant-scoped read path | TC-AGA-14 | With the application-level tenant filter removed in a test setup, run lookups and resolution both see only the key's tenant (mirrors TC-PROV-25) | CI |
| REQ-AGA-15 | The proposal hash covers the returned proposal, not the model's output | TC-AGA-15 | Model output whose proposal hometown reformats or drops: `proposalHash` matches the JCS hash of the response's `proposal` exactly, or is `null` on a drop; the hash of the raw model output never appears | CI |

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
