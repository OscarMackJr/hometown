# Retrieval Tiering And Source-System Load Budget

Version: 0.1
Status: Draft — addresses architecture evaluation gap C5
Audience: hometown team, divisional system owners (Nexus, Intrepid, ledger), CTO
Primary post-read action: assign a retrieval tier to every entity type, then obtain written load agreement from each divisional owner before the POC generates traffic.

## 1. The Unpriced Cost Of Virtualization-First

hometown's founding principle is that divisions keep their systems and context is read live rather than copied into a warehouse. That principle is correct, differentiating, and worth defending — Foundry's alternative is a pipeline and a copy, with the staleness and cost that implies.

What it has not yet accounted for is that **AI context retrieval issues queries against production operational systems**, at whatever volume AI adoption reaches. Three facts make this urgent rather than theoretical:

- The production latency target for CRM context lookup is still an open decision.
- Pre-aggregation strategy is mentioned in the roadmap and deferred.
- No divisional system owner has agreed to a load budget, because none has been asked.

The review risk is being told this is unanalyzed. The larger operational risk is a divisional DBA discovering unplanned AI traffic on an OLTP system and revoking access — which ends the program faster than any architectural criticism.

There is also a strong position available here, and it should be claimed: because retrieval freshness is declared per entity type and the Answer Trace Envelope already records `asOf` on every piece of evidence, hometown can state exactly how fresh the context behind any given answer was. Foundry's honest answer to the same question is "whenever the pipeline last ran." Turn the weakness into the differentiator by making freshness explicit rather than incidental.

## 2. Three Retrieval Tiers

Every entity type is assigned exactly one tier, recorded in configuration alongside its semantic model.

**Tier L — live query.** Direct read at request time. Freshest, most expensive. Reserved for low-volume, high-freshness-requirement lookups where staleness would be materially wrong (current loan status during a servicing conversation, for example). Requires a read replica where one exists, a strict timeout, and a concurrency cap.

**Tier P — pre-aggregated, bounded staleness.** Cube pre-aggregation refreshed on a schedule, with a **declared freshness bound** (for example, fifteen minutes). The default and the expected home for most entity types. The freshness bound is part of the entity's contract, surfaces through evidence `asOf`, and is therefore visible in any answer's provenance.

**Tier M — materialized hot path.** Context assembled and cached for high-volume repeated retrieval patterns. Used only where measurement shows Tier P cannot meet the latency target. Requires an explicit invalidation strategy; no Tier M assignment is approved without one.

Rules:

- Default to Tier P. Tier L requires justification; Tier M requires measurement.
- Every assignment records its freshness bound, and the bound is what the ATE reports.
- Tier assignment is reviewed with the divisional owner, not chosen unilaterally by hometown.

## 3. Source-System Load Budget

For each divisional system, agree and record:

| Parameter | Purpose |
|---|---|
| Maximum sustained query rate from hometown | The number the DBA cares about |
| Maximum concurrent connections | Connection-pool sizing input |
| Permitted read target | Replica strongly preferred; primary only by exception |
| Permitted query windows | Where batch or end-of-day processing must be protected |
| Escalation contact | Who is called when hometown is the suspected cause |

Enforcement is hometown's responsibility, not the source system's:

- Connection pools sized to the agreed concurrency, not to demand.
- Rate limiting on retrieval per source.
- **Circuit breaker** that trips on sustained latency or error and stops sending traffic — which then invokes the declared degradation mode for the affected feature. This is the direct link to the semantic-path degradation policy: the circuit breaker is *how* a source becomes unavailable in an orderly way rather than by exhausting the source.
- Bluto's resolution jobs draw from the same budget and must be scheduled accordingly. An identity-resolution batch is a large read; it does not get a free pass.

## 4. Latency Targets

Set per feature, not globally, and measured end to end from request to context-assembly complete. Each feature's target combines with the retrieval timeout budgets in the degradation specification — a target without a timeout is a wish.

Establish targets from measurement during the POC rather than proposing them now, consistent with how the program is treating SLOs generally. What must exist before the POC is the *measurement plan* and the tier assignments; the numbers come out the other side.

## 5. The Divisional Agreement Artifact

One short document per source system, signed by the system owner, recording: the tiers hometown will use against it, the load budget parameters, the read target, the escalation contact, and the review cadence. Three of these — Nexus, Intrepid, ledger — are the deliverable.

This is a governance artifact, not a technical one, and it is the item most likely to slip because it requires other people's calendars. Start it first.

## 6. Requirements And Test Criteria

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-RET-01 | Every entity type has an assigned tier and declared freshness bound | TC-RET-01 | Configuration review: no entity type retrievable without a tier assignment | CI + AUDIT |
| REQ-RET-02 | Answer provenance reports actual context freshness | TC-RET-02 | Evidence `asOf` values in a trace reflect the tier's freshness bound; a query surfaces answers built on stale context | DEMO |
| REQ-RET-03 | Load against each source is bounded and enforced by hometown | TC-RET-03 | Load test confirms rate and concurrency caps hold under burst; the circuit breaker trips and recovers | MEAS |
| REQ-RET-04 | Every divisional source has a signed load agreement | TC-RET-04 | Three agreement documents exist and are current | AUDIT |
| REQ-RET-05 | Identity resolution respects the same budget | TC-RET-05 | A Bluto resolution run does not breach any source's agreed rate | MEAS |

## 7. Open Decisions

- Read replica availability per source — determines whether Tier L is viable at all for some entities.
- Whether Cube pre-aggregation refresh runs against replicas (it should) and where its own storage lives.
- Per-feature latency targets, deferred to POC measurement.
- Whether any entity type genuinely requires Tier M in v1, or whether that assignment can be deferred until measurement proves it necessary. Recommendation: defer; unmeasured caching is a source of stale-data incidents, not performance.
