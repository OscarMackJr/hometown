-- Minimal evaluation harness store, v0.1.
-- Runtime verification remains file-backed for CI, but this contract records
-- the eventual relational shape. Evaluation rows reference trace_id; they do
-- not copy evidence bodies, prompt text, answer text, model cost, or tokens.

CREATE TABLE IF NOT EXISTS eval_run (
  eval_run_id         text PRIMARY KEY,
  suite_id            text        NOT NULL,
  created_at          timestamptz NOT NULL,
  judge_model         text        NOT NULL,
  judge_prompt_version text       NOT NULL,
  question_count      int         NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_result (
  eval_run_id          text        NOT NULL REFERENCES eval_run(eval_run_id),
  question_id          text        NOT NULL,
  domain               text        NOT NULL,
  feature_tag          text        NOT NULL,
  trace_id             uuid        NOT NULL REFERENCES answer_trace(trace_id),
  primary_request_id   text        NOT NULL,
  groundedness_score   numeric(5,4) NOT NULL CHECK (groundedness_score >= 0 AND groundedness_score <= 1),
  refusal_correct      boolean     NOT NULL,
  correct              boolean     NOT NULL,
  judge_model          text        NOT NULL,
  judge_prompt_version text        NOT NULL,
  notes                text,
  PRIMARY KEY (eval_run_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_result_trace ON eval_result(trace_id);
CREATE INDEX IF NOT EXISTS idx_eval_result_request ON eval_result(primary_request_id);
CREATE INDEX IF NOT EXISTS idx_eval_result_feature ON eval_result(feature_tag);