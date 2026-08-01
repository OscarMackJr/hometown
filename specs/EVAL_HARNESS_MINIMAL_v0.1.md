# Minimal Evaluation Harness

Version: 0.1
Status: Draft — addresses architecture evaluation gap S2; a deliberate partial pull-forward of POC C
Audience: hometown team, application owners, CTO
Primary post-read action: approve the pull-forward, and commission twenty golden questions per onboarded domain.

## 1. Why Now Rather Than At POC C

The program can currently demonstrate that AI is governed, attributed, reliable, and traceable. It cannot demonstrate that any answer is **correct**. Evaluation sits third in the POC ordering, behind provenance and governed access.

Two arguments for pulling a minimal version forward:

**The review argument.** "How do you know an answer was right, not merely governed?" is a certain question in the partner review. "Evaluation is chartered as POC C" is a weak answer when the program is otherwise this specific. Twenty golden questions and a groundedness check convert it into a demonstration.

**The engineering argument, which matters more.** Popeye deliberately makes model choice reversible — that is one of its main justifications. Swapping models or revising prompts without an evaluation baseline is how answer quality degrades silently. The capability that makes the program flexible is exactly the capability that makes an evaluation baseline necessary. Building the flexibility first and the safety net second is the wrong order, and it is currently the planned order.

This specification is deliberately *minimal*. The full harness, scoring sophistication, and continuous evaluation remain POC C.

## 2. Scope

**In scope:**

- A golden-question set per onboarded domain — approximately twenty questions each, authored with the application owner, each with an expected-behaviour note rather than a rigid expected string.
- A runner that executes the set through the normal path (gateway, real retrieval, real prompt construction) and captures the resulting trace ids.
- Two scoring dimensions only:
  - **Groundedness** — did the answer use the retrieved evidence, and does it contradict it? Scored against the evidence recorded in the Answer Trace Envelope, which is why this depends on POC A.
  - **Refusal correctness** — for questions that *should* be refused (no governed context available, out of scope, requires unavailable authorization), did the system correctly refuse? This is where the semantic-path degradation policy gets tested rather than assumed.
- **Cost per correct answer**, computed by joining trace ids to `ai_token_usage`.
- Results stored as `eval_run` and `eval_result` records referencing `trace_id`.

**Out of scope, deferred to POC C:** comprehensive metric suites, retrieval precision and recall measurement, adversarial and red-team sets, continuous evaluation gating deployments, and a results UI.

## 3. Scoring Approach

Groundedness scoring uses an LLM-as-judge, with two properties that matter:

1. **Judge calls route through the popeye gateway** under their own feature tag and budget. Evaluation spend is therefore metered and attributed like any other AI usage — the system evaluates itself under its own governance, which is a small point that lands well in review.
2. **The judge sees evidence and answer, never the source records directly.** It scores against exactly what the ATE recorded, so the evaluation measures the system as documented rather than as hoped.

Human adjudication of a sample is required for the first run: an unvalidated judge is an opinion generator. Record judge model and prompt version on every `eval_run`, because judge drift is otherwise indistinguishable from system regression.

## 4. The Metric Worth Leading With

**Cost per correct answer.** Groundedness alone is a table-stakes metric that every vendor reports. Joined to actual spend, it produces statements this program can make and most cannot:

> Model A scores four points higher on groundedness at 3.1x the cost per correct answer.

That is a procurement-grade sentence, it falls directly out of the ATE-to-ledger join that already exists, and it is uncomfortable for any vendor whose pricing is opaque. It costs almost nothing to compute once the harness runs.

## 5. When It Runs

- On demand, during development.
- Before any prompt template version change.
- Before any model or model-group change in the gateway configuration.

The third is the regression gate that justifies the pull-forward. Making it a *blocking* gate is POC C's decision; for now, running it and recording the delta is sufficient.

## 6. Requirements And Test Criteria

| REQ | Requirement | TC | Test criteria | Method |
|---|---|---|---|---|
| REQ-EVAL-01 | Each onboarded domain has a golden-question set | TC-EVAL-01 | Twenty questions per domain exist, owner-reviewed, including refusal cases | AUDIT |
| REQ-EVAL-02 | Answers are scored for groundedness against recorded evidence | TC-EVAL-02 | A run produces scores linked to trace ids; a deliberately ungrounded answer scores low | CI |
| REQ-EVAL-03 | Refusal behaviour is verified, not assumed | TC-EVAL-03 | Questions requiring refusal are correctly refused under the declared degradation mode | CI |
| REQ-EVAL-04 | Quality is reportable against cost | TC-EVAL-04 | A query returns cost per correct answer by model and feature tag | DEMO |
| REQ-EVAL-05 | Evaluation spend is itself governed | TC-EVAL-05 | Judge calls appear in the ledger under their own feature tag and budget | AUDIT |

This partially satisfies REQ-PROV-09 from the program requirements matrix; the full requirement remains with POC C.

## 7. Open Decisions

- Which model judges. Recommendation: a different model family from the one under evaluation, to reduce self-preference bias.
- Where the harness runs long-term — hometown for now; if evaluation becomes a continuous gate, it may want scheduled infrastructure in popeye's estate. That placement decision stays open, as previously recorded.
- Whether refusal cases live in the same set as answerable ones or a separate suite. Recommendation: same set, since the ratio itself is informative.
