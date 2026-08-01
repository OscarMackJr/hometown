-- Answer Trace Envelope store, v0.2 (POC A + semantic degradation status).
-- Owned by hometown; locally in the shared Postgres, MVP alongside the
-- popeye reporting store so trace-to-ledger joins are one database.
-- Append-only by policy AND by grant: the writer role gets INSERT, not
-- UPDATE/DELETE (spec design rule 3, enforced structurally).

CREATE TABLE IF NOT EXISTS answer_trace (
  trace_id            uuid PRIMARY KEY,
  schema_version      text        NOT NULL,
  created_at          timestamptz NOT NULL,

  origin_org          text        NOT NULL,
  origin_system       text        NOT NULL,

  -- Denormalized principal (design rule 1 exception; ledger authoritative)
  app_id              text        NOT NULL,
  user_id             text        NOT NULL,
  tenant_id           text,
  feature_tag         text        NOT NULL,

  query_hash          text        NOT NULL,
  target_integration  text        NOT NULL,

  primary_request_id  text        NOT NULL,  -- join key to "LiteLLM_SpendLogs".request_id
  answer_hash         text        NOT NULL,

  evidence_count      int         NOT NULL,  -- 0 is a queryable groundedness flag
  context_complete    boolean     NOT NULL,  -- false means at least one required/attempted context path was incomplete
  degradation_mode    text        NOT NULL CHECK (degradation_mode IN ('fail_closed', 'degrade_with_disclosure')),

  -- Full envelope, validated by AnswerTraceSchema before insert.
  -- References and hashes only; bodies never (design rule 2).
  envelope            jsonb       NOT NULL
);

-- Existing v0.1 tables can be brought forward without rewriting historical
-- envelopes; new writers must populate these fields from ATE v0.2 retrieval.
ALTER TABLE answer_trace
  ADD COLUMN IF NOT EXISTS context_complete boolean NOT NULL DEFAULT true;

ALTER TABLE answer_trace
  ADD COLUMN IF NOT EXISTS degradation_mode text NOT NULL DEFAULT 'fail_closed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'answer_trace_degradation_mode_check'
  ) THEN
    ALTER TABLE answer_trace
      ADD CONSTRAINT answer_trace_degradation_mode_check
      CHECK (degradation_mode IN ('fail_closed', 'degrade_with_disclosure'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_answer_trace_created      ON answer_trace (created_at);
CREATE INDEX IF NOT EXISTS idx_answer_trace_request      ON answer_trace (primary_request_id);
CREATE INDEX IF NOT EXISTS idx_answer_trace_app          ON answer_trace (app_id, created_at);
CREATE INDEX IF NOT EXISTS idx_answer_trace_tenant       ON answer_trace (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_answer_trace_context      ON answer_trace (context_complete, feature_tag, created_at);
CREATE INDEX IF NOT EXISTS idx_answer_trace_degradation  ON answer_trace (degradation_mode, created_at);
CREATE INDEX IF NOT EXISTS idx_answer_trace_evidence     ON answer_trace USING gin (envelope jsonb_path_ops);

-- Roles (run as the instance admin; local admin is the nexus role):
--   Writer: the hometown engine. INSERT only — immutability by grant.
--     GRANT INSERT ON answer_trace TO hometown_trace_writer;
--   Reader: the semantic layer, same pattern as the popeye ledger.
--     GRANT SELECT ON answer_trace TO ekg_cube_reader;