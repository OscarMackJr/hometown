# Answer Trace Viewer

Version: 0.1
Status: Draft — addresses architecture evaluation gap S3
Audience: hometown team, CTO (demo), partner reviewers
Primary post-read action: approve the deliberate exception to the program's no-UI stance, and scope it to one day of work.

## 1. Why This Exists

The single most differentiating demonstration Fiskroad can give is: **click an AI answer, see the governed evidence behind it, the policy that applied, and what it cost.** That capability is what the Answer Trace Envelope and its join to the popeye ledger were built for.

It currently has nowhere to happen. Cube's development playground is a query tool, not a demonstration surface, and asking a reviewer to read JSON forfeits the impact of the one thing the program does better than the platform it is being compared against.

The program has deliberately avoided building UI, for good reasons recorded in the portfolio analysis — competing on polish is a losing position. This is the exception, and it is narrow: a read-only viewer over data that already exists, not a product surface.

## 2. Scope

**In scope.** Look up a trace by request id, or list recent traces filtered by user, application, feature tag, and time. For a selected trace, display:

- The question hash, and the question text only where the feature's policy permits storing it.
- **Evidence**: each record's source integration, entity, `asOf` timestamp, record hash, validation status, and — once Bluto lands — the resolved `party_id` and the identity ruleset version in force.
- **Retrieval status** (ATE v0.2): which sources were attempted, their outcome, and whether context was complete.
- **Prompt shape**: template id and version, sections with their evidence references and token counts. Not prompt text; there is none stored.
- **Model calls**: each request id and role, with the primary call marked.
- **Cost**: tokens and dollars, joined live from `ai_token_usage` on `primary_request_id`.
- **Policy decisions**, once POC B populates them.

**Explicitly out of scope.** Editing anything. Ad-hoc analytics or charting — that is Cube's job. Prompt or completion content — none is stored, by design. Any write path whatsoever.

## 3. The Empty Content Panel Is A Feature

The viewer will show no prompt text and no answer text. Rather than hiding that, label it: the trace store holds references and hashes by design, so provenance is auditable without creating a second copy of sensitive content. A reviewer from a regulated institution will recognise immediately what that buys, and it converts an apparent limitation into the strongest privacy statement the program makes. Put it on the screen, not in the speaker notes.

## 4. Security Requirements

The viewer is a **new read path over governed data** and inherits every existing control rather than working around any of them:

- Entra authentication; no anonymous access, no shared service account.
- Reads through the same tenant-isolated path as every other consumer. Because tenant isolation is enforced at the database layer, the viewer inherits it without per-consumer filtering code — this viewer is the first real test of that inheritance property (TC-TEN-04).
- Read-only database role. No write grants exist for this application.
- Viewer access itself is access to provenance about other people's questions. Restrict to a named group; do not make it generally available because it is interesting.

A provenance tool that becomes an authorization bypass would be a memorable way to fail the review.

## 5. Implementation Guidance

Keep it small. A minimal server-rendered application or a single-page view over a thin read API is sufficient; the program's frontend conventions apply if one is used. Two queries drive the whole thing — one for the trace record, one for the joined cost — so the engineering is genuinely a day's work plus review.

Resist scope growth. Every additional feature moves this toward the general-purpose UI the program decided not to build. If someone asks for charts, the answer is Cube.

## 6. Requirements And Test Criteria

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-PROV-10 | An answer's full provenance is inspectable in one place | TC-PROV-10 | For a seeded answer, evidence, retrieval status, prompt shape, model calls, and cost are all visible without leaving the view | DEMO |
| REQ-PROV-11 | The viewer enforces tenant isolation by inheritance | TC-PROV-11 | A user scoped to one tenant cannot retrieve another tenant's traces, with no viewer-specific filtering code | CI |
| REQ-PROV-12 | The viewer is read-only | TC-PROV-12 | Grant assertion: the viewer's database role holds no write privileges | AUDIT |

## 7. Open Decisions

- Whether the viewer ships in the hometown repository or as a small separate application. Recommendation: hometown, since it is a read surface over hometown's own contract and has no independent lifecycle.
- Whether trace retention limits what the viewer can show, which depends on the retention decision still open in the ATE specification.
