# Semantic Path Degradation Policy

Version: 0.1
Status: Draft — addresses architecture evaluation gap C4
Audience: hometown team, application owners, popeye team (ATE contract change)
Primary post-read action: assign a degradation mode to every feature tag, and approve the ATE v0.2 field addition.

## 1. The Gap

Popeye's reliability model is thorough: failure domains, bounded overspend, provider fallback, break-glass, and the rule that observation never blocks a request. All of it describes the **gateway path**.

Context retrieval runs through a different path — Cube, the divisional source systems, and now Bluto — and that path is equally synchronous and equally able to fail. Nothing currently states what happens when it does. "Observation never blocks" covers trace writing; it says nothing about what an AI feature should do when the CRM is unreachable.

The three possible behaviours are very different products:

- Answer anyway, with no governed context (an ungrounded answer, presented as if grounded — the worst outcome).
- Answer with partial context and disclose the gap.
- Refuse and explain.

Which one is correct depends on the feature, so this must be a declared policy, not an emergent behaviour.

## 2. Failure Modes To Cover

| Mode | Effect | Notes |
|---|---|---|
| Cube unavailable | No governed retrieval at all | Semantic layer is a hard dependency for governed context |
| One source system unavailable | Partial context | The common case; a divisional outage should not take down every feature |
| Source system slow | Latency budget exceeded | Must be bounded by timeout, not left to hang |
| Bluto unavailable | Cross-domain resolution unavailable | Degrade to single-domain retrieval; never fall back to ad-hoc key matching |
| Validation failure | A record fails the semantic contract | Excluded from evidence — never passed through unvalidated |
| Empty result | Query succeeded, no matching context | Not a failure; a legitimate and distinct state |

The Bluto row deserves emphasis: the degraded behaviour is *narrower* retrieval, never *looser* matching. Falling back to name matching because the identity spine is down would silently reintroduce exactly the unauditable joins Bluto exists to eliminate.

## 3. The Policy Model

Every feature tag declares a degradation mode:

- **`fail_closed`** — if governed context is unavailable or incomplete beyond the feature's threshold, refuse to answer and say why. Required default for anything advisory, customer-facing, or touching regulated context. A wrong loan answer is worse than no loan answer.
- **`degrade_with_disclosure`** — answer using available context, state in the response that context was partial, and record the gap in the trace. Appropriate for exploratory, internal, and summarization features.

Each feature also declares:

- **Required sources** — sources whose absence triggers the fail-closed path regardless of mode.
- **Retrieval timeout budget** — per source, and an overall ceiling for the retrieval phase.
- **Minimum evidence threshold** — where meaningful (for example, at least one record from the required source).

Undeclared feature tags default to `fail_closed`. Deny by default is the right bias when the alternative is confidently ungrounded output.

## 4. Recording It: ATE v0.2

Partial context must be a first-class recorded fact, not an inference from a short evidence array. The current envelope records what *was* used; it cannot distinguish "one source was consulted and returned one record" from "three were attempted, two failed."

Proposed addition to the Answer Trace Envelope:

- `retrieval` (object): `{ attempted: [{ source, status: "ok" | "timeout" | "error" | "empty", latencyMs }], degradationMode, contextComplete: boolean }`

This is a contract change and therefore a **two-team review** under the Fiskroad invariants, even though popeye's code does not change. Combine it with the Bluto-driven ATE change (`party_id` values and identity ruleset version) into a single v0.2 revision rather than two consecutive contract changes.

The payoff is that `contextComplete = false` becomes queryable alongside the existing `ungrounded_answers` measure, so "how often are we answering on partial context, and for which features" is a governed question rather than a log-scraping exercise.

## 5. User-Visible Behaviour

- `fail_closed`: the feature returns an explicit inability-to-answer with the reason category (context unavailable), never a plausible answer generated without it.
- `degrade_with_disclosure`: the response states plainly which context was unavailable. Disclosure is part of the product, not a debug detail — an undisclosed degraded answer is indistinguishable from a fully grounded one, which is precisely the failure the provenance work exists to prevent.

## 6. Operational Signals

- Metric: retrieval attempts by source and status; partial-context rate by feature tag.
- Alert: sustained partial-context rate above threshold for any feature tag; any `fail_closed` feature refusing at elevated rate (a user-visible outage that would otherwise be invisible to gateway metrics, since the gateway is healthy throughout).
- These are hometown-side signals. Popeye's dashboards will look entirely green during a divisional source outage, which is exactly why this specification exists.

## 7. Requirements And Test Criteria

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-REL-09 | Every feature tag declares a degradation mode | TC-REL-09 | Configuration review; undeclared tags resolve to `fail_closed` | CI + AUDIT |
| REQ-REL-10 | Source outage produces declared behaviour, not undefined behaviour | TC-REL-10 | With one source stopped, a `fail_closed` feature refuses and a `degrade_with_disclosure` feature answers with disclosure | DEMO |
| REQ-REL-11 | Partial context is recorded and queryable | TC-REL-11 | Traces from the above show `contextComplete = false` and per-source status; a Cube query returns partial-context rate by feature | CI |
| REQ-REL-12 | Identity outage narrows scope rather than loosening matching | TC-REL-12 | With Bluto unavailable, cross-domain retrieval is unavailable and no name-based fallback join occurs | CI |

## 8. Open Decisions

- Retrieval timeout budgets per source — depends on the source-load and latency work in the retrieval tiering specification; these two documents should be completed together.
- Whether `degrade_with_disclosure` requires specific response wording, or leaves phrasing to the feature. Recommendation: a shared disclosure phrase, so users learn to recognise it.
