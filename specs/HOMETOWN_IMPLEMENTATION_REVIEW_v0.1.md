# Hometown Implementation Review

Version: 0.1
Status: Draft — review of `OscarMackJr/hometown`, branch `main`
Audience: CTO, hometown team, POC lead
Primary post-read action: fix H1 through H4 before the POC. H1 will fail a demo beat on day 3; H2 explains why nothing caught it.
Basis: source inspection against the hometown specification set. Nothing was executed; no tests were run.

## 1. Summary

Considerable ground has been covered. Every review-response specification has a corresponding artifact: retrieval tiering, semantic-path degradation, tenant isolation, the trace viewer, and the evaluation harness all exist as code, not intentions. The roadmap consolidation landed cleanly. Several implementations are careful and correct.

The problems are not in the new work. They are in the verification layer, and they compound: **the ledger model still contains all five column errors flagged three weeks ago, the verifier that should catch them asserts the errors are present, and CI does not run that verifier anyway.** Three independent safety nets, none of which functioned.

Recommendation: fix H1 through H4 before the POC starts. H1 and H2 are hours of work and prevent a demo failure.

## 2. What Is Well Built

**Tenant isolation RLS is correct, and correct in the details that usually go wrong.** The migration does `ENABLE` *and* `FORCE ROW LEVEL SECURITY` on all four Intrepid tables, with policies scoped to `ekg_cube_reader`. The predicate is the important part:

```sql
USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
```

The `true` second argument means a missing setting returns NULL rather than raising; `nullif` normalises empty string to NULL; and `tenant_id = NULL` evaluates to NULL, which is not true, so the row is excluded. Absent tenant identity yields zero rows rather than all rows. That is fail-closed by construction, and it is exactly what the specification asked for. This is better than most production RLS implementations.

**Trace write failure is genuinely non-blocking.** The engine wraps the write in try/catch, records the failure on the result, logs it, and returns the answer regardless. That honours "observation must never block" as behaviour rather than as a comment.

**The retrieval and degradation policies are real.** Tier policy per integration and entity type, degradation mode per feature tag, required sources, minimum evidence threshold, circuit-breaker state tracking, and a `retrieval` block carrying per-source attempts and `contextComplete`. This is the C4 and C5 specification implemented, not gestured at.

**The engine refuses to retrieve without a declared policy.** `queryContextWithPolicy` throws if no tier policy exists for the integration and entity type. Deny-by-default applied where it matters.

## 3. Defects To Fix Before The POC

### H1. The gateway ledger model still contains all five column errors — the chargeback demo will fail

`cube/model/ai_token_usage.yml` is unchanged from the version reviewed three weeks ago. Against the actual `LiteLLM_SpendLogs` schema:

| Model says | Reality | Effect |
|---|---|---|
| `api_key_alias AS app_id` | column does not exist; app attribution is `team_id` | query error |
| `user_id` | column is `"user"`, a reserved word requiring quotes | query error |
| `spend_logs_metadata->>'tenant_id'` | `spend_logs_metadata` is a key inside `metadata`, not a column | query error |
| `latency` | column is `request_duration_ms` | query error |
| `startTime AS created_at` | unquoted, folds to `starttime` | query error |

Still absent: the `cloud` dimension, which test criterion TC-COST-04 is written against, and `agent_id` with the `desktop_agent_traffic` segment, which is how the endpoint slice gets demonstrated.

Cube reports column errors at query time, not load time, so the model will load cleanly and fail on first execution. **This is P0.3 in the intern guide — a must-hold demo beat — scheduled for day 3.** A corrected model was supplied previously; it appears never to have been applied.

**Fix:** apply the corrected projection, then verify it by running `\d public."LiteLLM_SpendLogs"` against the live ledger and comparing column by column, rather than trusting either file.

### H2. The verifiers assert the bugs are present — they are pinned to the wrong baseline

This is the more important finding, because it explains H1 and predicts its recurrence.

`scripts/verify-gateway-ledger-model.mjs` requires the model file to *contain* these exact strings:

```js
'api_key_alias AS app_id',
"spend_logs_metadata->>'tenant_id' AS tenant_id",
'latency',
'startTime AS created_at',
```

The verifier passes because the model is wrong. Correcting the model per H1 makes the verifier **fail**. The verification gate does not merely miss the defect — it actively defends it and will block the fix.

`verify-gateway-attribution.mjs` repeats the same assertions, so two verifiers agree, both wrongly.

The root cause is structural: these scripts compare a file against a hardcoded copy of itself. That is a change-detector, not a correctness-checker. It answers "has this text changed?" and never "does this text correspond to reality?" A tautology cannot fail for the right reason.

`verify-gateway-access.mjs` extends the pattern further, asserting that prose sentences appear in `ROADMAP.md` and `STATE.md`. Useful for catching accidental deletion of a boundary statement; not verification of anything the system does.

**Fix:** repoint the assertions at the corrected model, and add a `--live` mode that reads `information_schema.columns` from the ledger and asserts every column the projection references actually exists with a compatible type. That converts the check from self-referential to grounded. It is perhaps thirty lines and it is the difference between a gate and a decoration.

Worth noting the same weakness elsewhere: `verify-trace-reconciliation.mjs` asserts that `answer_trace_ddl.sql` and `ai_answer_traces.yml` contain particular substrings. Two files agreeing about text is not evidence that the DDL was applied or that the model resolves against it.

### H3. CI runs four of seventeen verifiers — the specification's CI-enforced criteria are not enforced

`package.json` defines seventeen verification scripts. `.github/workflows/factory-validation.yml` runs four: build, `validate:cube`, `smoke:cube:intrepid`, `test:factory`.

Not run by CI, despite existing:

`verify:intrepid:tenant-safety` · `verify:gateway:ledger-model` · `verify:gateway:attribution` · `verify:gateway:access` · `verify:gateway:ledger-reconciliation` · `verify:trace:contract` · `verify:trace:reconciliation` · `verify:trace:viewer` · `verify:retrieval-policy` · `verify:eval:harness` · `verify:intrepid:cube-adapter` · `verify:intrepid:sandbox-mapping`

Several specification test criteria name CI as their verification method — TC-TEN-01 through TC-TEN-04, TC-PROV-04, TC-PROV-06, TC-REL-09 through TC-REL-12, TC-COST-06. The scripts exist; the gate ignores them. A criterion whose method is "CI" and whose script never runs in CI is not met, however good the script is.

**Fix:** add the verifiers to the workflow. Contract-mode scripts need no credentials and can run on every pull request; live-mode scripts run on a schedule or with environment secrets. This is a fifteen-line workflow change and it is the highest-leverage item in this review.

### H4. Build output and dependencies are committed, and verifiers run against the committed build

`git ls-files` shows 1,259 tracked files under `node_modules/` and 12 under `dist/`, despite `node_modules/` appearing in `.gitignore` — they were committed before the ignore rule and never removed, so the rule has no effect on tracked files.

Two consequences beyond repository bloat:

**Verifiers can test stale code.** Most verification scripts run `npm run build` first, but `verify:trace:reconciliation` does not, and it imports from `../dist/core/factory.js`. If `src` and `dist` diverge, that verifier tests the committed artifact rather than the current source, and reports a pass for code that no longer exists.

**Dependency integrity is unverifiable.** A committed `node_modules` can be modified without any lockfile or registry check detecting it. For a repository that is intended to be shared with sister organisations, this is a supply-chain concern rather than an aesthetic one, and it directly undermines the "clean clone runs in under a day" criterion, TC-OPEN-04.

**Fix:** `git rm -r --cached node_modules dist`, add `dist/` to `.gitignore`, and add `npm run build` to every verifier that imports from `dist`.

## 4. Significant, But Not POC-Blocking

**S1. `infra/main.tf` still contains a hardcoded password, twice.** `password = "[redacted-hardcoded-password]"` appears at lines 45 and 62 of a git-tracked file. This was flagged in the previous review. Beyond the credential itself, the file provisions AWS and Azure database infrastructure from hometown, which contradicts the project's virtualization-first principle — hometown reads divisional systems, it does not provision them. Remove the file or move it to `specs/attic/` with a header explaining it is superseded, and rotate anything that used that string.

**S2. The trace store is a JSONL file, not the Postgres table.** `sql/answer_trace_ddl.sql` defines `answer_trace` with INSERT-only grants for immutability; `cube/model/ai_answer_traces.yml` reads `public.answer_trace`; but `FileAnswerTraceWriter` appends JSON lines to a file. No Postgres writer exists. The consequence is that the immutability guarantee — REQ-PROV-05, enforced by grant — does not apply to the artifact actually being written, since a file can be edited freely. Acceptable for local development if stated; not acceptable as the POC's provenance story. Either implement a Postgres writer or record explicitly that the file writer is development-only and traces are not yet immutable.

**S3. Canonicalization uses `localeCompare`, which is locale-dependent.** `hash.ts` sorts object keys with `localeCompare` before hashing. That comparator's ordering varies with ICU data and locale, so the same semantic record can canonicalize differently on different machines, producing different `recordHash` values for identical evidence. Since the hash is the evidence anchor — and the ATE specification anticipates signing these envelopes for cross-organisation exchange — this needs to be deterministic. Use a code-unit comparison (`a < b ? -1 : a > b ? 1 : 0`) as an immediate fix, and adopt RFC 8785 (JCS) before anything is signed, which the specification already flags as a required decision.

**S4. The evaluation harness judge is a local stub, not a gateway-routed model.** `scoreWithStubJudge` with `judgeModel: 'stub-local-deterministic'` is a reasonable scaffold, and recording `judgeModel` and `judgePromptVersion` on every run is exactly right. But the specification's point was that judge calls route through popeye so evaluation spend is itself metered and attributed — the system evaluating itself under its own governance. TC-EVAL-05 is not met by a stub. Fine for now; do not let the stub be mistaken for the capability.

**S5. The trace viewer is a renderer with no server, and therefore no auth.** `trace-viewer.ts` produces HTML with proper escaping — good — but has no HTTP server, no Entra authentication, and no tenant-scoped read path. The specification's security requirements (REQ-PROV-11, REQ-PROV-12) apply to the surface that will serve it. Worth stating in the spec that the current artifact is a renderer and the security requirements attach when a server is added, so nobody assumes they are satisfied.

**S6. `CREATE ROLE ekg_cube_reader LOGIN` has no password.** Depending on `pg_hba.conf`, this may permit passwordless connections. Set a password or restrict the role's authentication method explicitly.

## 5. The Pattern Worth Naming

Bluto's review found that an elaborate governance apparatus did not catch a plain-SHA256-for-HMAC substitution or a contract promising fields the schema could not store. Hometown shows the same shape from a different angle: seventeen verification scripts exist, four run, and two of the unrun ones assert that a known defect is still present.

The common failure is that verification is checking **text against text** rather than **artifacts against reality**. A verifier that greps a YAML file for strings it was written from cannot discover that the YAML is wrong. A CI gate that runs a third of the suite cannot enforce criteria assigned to the other two thirds.

The remedy is small and specific, and it is the same in both repositories: every verifier that describes an external system should have a live mode that queries that system, and the CI gate should run everything that does not need credentials. Two changes, both under an hour, and they convert a verification layer that currently provides false assurance into one that provides real assurance.

The specification-first discipline in this program is genuinely producing good architecture. What it has not yet produced is a habit of testing claims against the world rather than against other documents. That is the gap to close before the partner review, because it is the gap a reviewer will find by asking one question: "show me that running."

## 6. Fix List, In Order

1. **H1** — correct `ai_token_usage.yml` against the live schema; restore `cloud` and `agent_id`. Verify with `\d`, not by reading a file.
2. **H2** — repoint the two verifiers at the corrected model; add live-mode schema assertions against `information_schema.columns`.
3. **H3** — run all contract-mode verifiers in CI. Fifteen lines, highest leverage in this review.
4. **H4** — untrack `node_modules` and `dist`; add `npm run build` to verifiers importing from `dist`.
5. **S1** — remove the hardcoded credential and the misplaced Terraform; rotate.
6. S2 through S6 as capacity allows.

Items 1 through 4 are a morning's work between them, and they are the difference between a POC that demonstrates the chargeback query on day 3 and one that discovers on day 3 that it cannot.

