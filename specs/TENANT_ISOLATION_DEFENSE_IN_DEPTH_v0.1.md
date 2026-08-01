# Tenant Isolation: Defense In Depth

Version: 0.1
Status: Draft — addresses architecture evaluation gap C3
Audience: hometown team, Bluto team, security
Primary post-read action: implement database-layer enforcement before POC B, and add the negative test that proves it.

## 1. The Problem

Tenant filtering today is enforced in the Cube security context: claims from an Entra-issued JWT drive a tenant filter applied to queries. That is standard practice and it is correct. It is also **a single layer**.

Failure modes that a single layer does not survive:

- A new Cube model is added without the tenant filter.
- A security context is misconfigured, or a claim is missing and the filter silently degrades.
- A developer or service connects with an over-broad token.
- A future consumer — the trace viewer, an eval harness, a reporting job — reaches the same data by a path that was never routed through the security context.

For a multi-tenant loan platform, cross-tenant disclosure is the highest-severity failure in the system. One misconfiguration should not be sufficient to cause it. Foundry's answer is access control enforced independently of the query layer, and a reviewer will compare directly.

## 2. The Requirement

**Two independent layers must each be sufficient to prevent cross-tenant access.**

- **Layer 1 — semantic (existing).** Cube security context derives the tenant from verified JWT claims and applies it to queries.
- **Layer 2 — database (new).** PostgreSQL row-level security policies on every tenant-scoped table, evaluated against a tenant identity carried on the database session. The database refuses to return other tenants' rows even when the query does not ask it to.

The test of success is not that both layers work. It is that **either layer alone is sufficient**: a deliberately broken Cube model must still return only the correct tenant's rows.

## 3. Implementation Requirements

Mechanism details are an implementation decision to confirm against current Cube and PostgreSQL behaviour, but these properties are mandatory:

1. **RLS enabled and forced.** Enable row-level security on every tenant-scoped table, and set `FORCE ROW LEVEL SECURITY`. Without `FORCE`, the table owner bypasses policies entirely — this is the single most common way an RLS implementation is silently useless.
2. **The reading role is neither owner nor superuser.** `ekg_cube_reader` (and every other read path) must not own the tables and must not hold `BYPASSRLS`. Verify this as a grant-level assertion, not an assumption.
3. **Tenant identity arrives on the session, not in the query.** The policy predicate reads a session-scoped setting established when the connection is used for a tenant's request, so the predicate cannot be omitted by a malformed query. The mechanism for establishing it per request — a per-tenant connection, a session variable set at checkout, or Cube's per-security-context driver configuration — is an implementation choice; the requirement is that it cannot be set by the query text itself.
4. **Fail closed.** If no tenant identity is present on the session, tenant-scoped tables return zero rows. Absence of a claim must never mean "all tenants."
5. **Applies to every consumer.** Any new read path over tenant-scoped data — trace viewer, eval harness, reconciliation verifier, Bluto's store, ad-hoc analysis connections — inherits Layer 2 automatically because it is enforced at the database. That inheritance is the main reason to do this now rather than after POC B.
6. **Bluto included.** `party` and `party_source_link` are tenant-scoped and carry the same policies. Identity mapping is one of the more sensitive cross-tenant leaks available, as the Bluto specification notes.

## 4. Verification

Extend the existing `verify:intrepid:tenant-safety` pattern. Three tests, and the second is the one that matters:

1. **Positive** — the same query under two tenant identities returns disjoint, correct results.
2. **Negative, Layer 1 disabled** — with the Cube tenant filter deliberately removed in a test fixture, the query **still** returns only the correct tenant's rows. This is the defense-in-depth proof and the single most valuable test in the suite.
3. **Fail-closed** — a session with no tenant identity returns zero rows from tenant-scoped tables, not all rows.

Add a grant-level assertion that the reading role is non-owner, non-superuser, without `BYPASSRLS`, and that `FORCE ROW LEVEL SECURITY` is set on every tenant-scoped table. This assertion is cheap and catches the classic regression where a table is recreated by a migration and quietly loses its policy.

## 5. Requirements And Test Criteria

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-TEN-01 | Tenant isolation is enforced at two independent layers | TC-TEN-01 | With the semantic-layer filter removed in a fixture, results remain correctly scoped | CI |
| REQ-TEN-02 | Absent tenant identity fails closed | TC-TEN-02 | A session with no tenant identity returns zero rows | CI |
| REQ-TEN-03 | The reading role cannot bypass policy | TC-TEN-03 | Grant assertion: non-owner, non-superuser, no `BYPASSRLS`, `FORCE` set on all tenant-scoped tables | CI + AUDIT |
| REQ-TEN-04 | Every new read path inherits enforcement | TC-TEN-04 | Trace viewer and eval harness queries are correctly scoped without additional per-consumer filtering code | CI |

## 6. Sequencing

Implement before POC B, not as part of it. POC B (governed access) layers purpose- and role-based authorization on top of tenant isolation; building it on a single-layer foundation means retrofitting the foundation later, under more load and with more consumers attached.

## 7. Open Decisions

- Per-tenant connection versus session-variable-per-checkout — a Cube configuration and connection-pooling decision with real operational consequences at scale.
- Whether non-tenant-scoped reference data is explicitly marked as such, so "no policy" is a recorded decision per table rather than an omission.
