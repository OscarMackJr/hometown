-- Answer Trace Envelope store, v0.1 (POC A).
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

  -- Full envelope, validated by AnswerTraceSchema before insert.
  -- References and hashes only; bodies never (design rule 2).
  envelope            jsonb       NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_answer_trace_created  ON answer_trace (created_at);
CREATE INDEX IF NOT EXISTS idx_answer_trace_request  ON answer_trace (primary_request_id);
CREATE INDEX IF NOT EXISTS idx_answer_trace_app      ON answer_trace (app_id, created_at);
CREATE INDEX IF NOT EXISTS idx_answer_trace_tenant   ON answer_trace (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_answer_trace_evidence ON answer_trace USING gin (envelope jsonb_path_ops);

-- Roles (run as the instance admin; local admin is the nexus role):
--   Writer: the hometown engine. INSERT only — immutability by grant.
--     GRANT INSERT ON answer_trace TO hometown_trace_writer;
--   Reader: the semantic layer, same pattern as the popeye ledger.
--     GRANT SELECT ON answer_trace TO ekg_cube_reader;
