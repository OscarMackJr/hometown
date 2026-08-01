CREATE TABLE public.loan_run (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  run_id text NOT NULL,
  as_of_date date NOT NULL,
  status text NOT NULL,
  irr_target numeric(9,4),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  portfolio text,
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT loan_run_tenant_run_id_key UNIQUE (tenant_id, run_id)
);

CREATE INDEX idx_loan_run_tenant_run
  ON public.loan_run (tenant_id, run_id);

CREATE INDEX idx_loan_run_tenant_created
  ON public.loan_run (tenant_id, created_at DESC);

CREATE TABLE public.loan_fact (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  run_id text NOT NULL,
  seller_loan_no text NOT NULL,
  original_balance numeric(18,2),
  current_balance numeric(18,2),
  purchase_price numeric(18,2),
  price_pct numeric(9,4),
  has_exceptions boolean DEFAULT false,
  status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_loan_fact_tenant_run
  ON public.loan_fact (tenant_id, run_id);

CREATE INDEX idx_loan_fact_tenant_run_loan
  ON public.loan_fact (tenant_id, run_id, seller_loan_no);

CREATE TABLE public.loan_exceptions (
  exception_id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  run_id text NOT NULL,
  seller_loan_no text NOT NULL,
  rule_id text,
  exception_type text NOT NULL,
  severity text,
  message text,
  metric_name text,
  expected_value numeric(18,6),
  actual_value numeric(18,6),
  balance_impact numeric(18,6),
  created_at timestamptz NOT NULL DEFAULT now(),
  difference numeric(18,6),
  original_balance numeric(18,2),
  purchase_price numeric(18,2)
);

CREATE INDEX idx_loan_exceptions_tenant_run
  ON public.loan_exceptions (tenant_id, run_id);

CREATE INDEX idx_loan_exceptions_tenant_run_loan
  ON public.loan_exceptions (tenant_id, run_id, seller_loan_no);

CREATE INDEX idx_loan_exceptions_rule_type
  ON public.loan_exceptions (exception_type, rule_id);

CREATE TABLE public.portfolio_exceptions (
  exception_id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  run_id text NOT NULL,
  rule_id varchar(100) NOT NULL,
  exception_type varchar(50) NOT NULL,
  platform varchar(20),
  expected_value numeric(18,6),
  actual_value numeric(18,6),
  difference numeric(18,6),
  balance_impact numeric(18,2),
  severity varchar(20),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT portfolio_exceptions_run_id_fkey FOREIGN KEY (tenant_id, run_id)
    REFERENCES public.loan_run (tenant_id, run_id)
);

CREATE INDEX idx_portfolio_exceptions_tenant_run
  ON public.portfolio_exceptions (tenant_id, run_id);

INSERT INTO public.loan_run (
  tenant_id,
  run_id,
  portfolio,
  status,
  as_of_date,
  created_at,
  updated_at,
  started_at,
  completed_at,
  irr_target,
  notes
) VALUES
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'INTREPID_RUN_2026_Q2_001',
    'SMOKE_PORTFOLIO',
    'SUCCEEDED',
    '2026-06-28',
    '2026-06-28 10:00:00+00',
    '2026-06-28 10:02:00+00',
    '2026-06-28 10:01:00+00',
    '2026-06-28 10:02:00+00',
    0.0850,
    'Disposable Cube smoke run'
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'INTREPID_RUN_2026_Q2_002',
    'SMOKE_PORTFOLIO_TENANT_2',
    'SUCCEEDED',
    '2026-06-29',
    '2026-06-29 10:00:00+00',
    '2026-06-29 10:02:00+00',
    '2026-06-29 10:01:00+00',
    '2026-06-29 10:02:00+00',
    0.0825,
    'Disposable Cube smoke run for tenant isolation proof'
  );

INSERT INTO public.loan_fact (
  tenant_id,
  run_id,
  seller_loan_no,
  status,
  has_exceptions,
  created_at,
  original_balance,
  current_balance,
  purchase_price,
  price_pct
) VALUES
  ('11111111-1111-4111-8111-111111111111'::uuid, 'INTREPID_RUN_2026_Q2_001', 'L1', 'ACTIVE', true, '2026-06-28 10:01:30+00', 250000.00, 240000.00, 235000.00, 0.9792),
  ('11111111-1111-4111-8111-111111111111'::uuid, 'INTREPID_RUN_2026_Q2_001', 'L2', 'ACTIVE', false, '2026-06-28 10:01:45+00', 125000.00, 120000.00, 118500.00, 0.9875),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'INTREPID_RUN_2026_Q2_002', 'L3', 'ACTIVE', true, '2026-06-29 10:01:30+00', 300000.00, 291000.00, 286000.00, 0.9828);

INSERT INTO public.loan_exceptions (
  tenant_id,
  run_id,
  seller_loan_no,
  rule_id,
  exception_type,
  severity,
  message,
  metric_name,
  created_at,
  expected_value,
  actual_value,
  difference,
  original_balance,
  purchase_price,
  balance_impact
) VALUES
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'INTREPID_RUN_2026_Q2_001',
    'L1',
    'RULE_X',
    'UNDERWRITING',
    'HIGH',
    'Mismatch',
    'dscr',
    '2026-06-28 10:02:00+00',
    1.250000,
    1.100000,
    -0.150000,
    250000.00,
    235000.00,
    1234.56
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'INTREPID_RUN_2026_Q2_002',
    'L3',
    'RULE_Y',
    'UNDERWRITING',
    'MEDIUM',
    'Tenant 2 mismatch',
    'ltv',
    '2026-06-29 10:02:00+00',
    0.800000,
    0.870000,
    0.070000,
    300000.00,
    286000.00,
    777.77
  );

INSERT INTO public.portfolio_exceptions (
  tenant_id,
  run_id,
  rule_id,
  exception_type,
  platform,
  expected_value,
  actual_value,
  difference,
  balance_impact,
  severity,
  created_at
) VALUES
  (
    '11111111-1111-4111-8111-111111111111'::uuid,
    'INTREPID_RUN_2026_Q2_001',
    'P_RULE_1',
    'PORTFOLIO',
    'Prime',
    100.0,
    90.0,
    -10.0,
    555.55,
    'MED',
    '2026-06-28 10:02:15+00'
  ),
  (
    '22222222-2222-4222-8222-222222222222'::uuid,
    'INTREPID_RUN_2026_Q2_002',
    'P_RULE_2',
    'PORTFOLIO',
    'Prime',
    200.0,
    190.0,
    -10.0,
    333.33,
    'LOW',
    '2026-06-29 10:02:15+00'
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ekg_cube_reader') THEN
    CREATE ROLE ekg_cube_reader LOGIN PASSWORD 'intrepid_smoke';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO ekg_cube_reader;
GRANT SELECT ON public.loan_run TO ekg_cube_reader;
GRANT SELECT ON public.loan_fact TO ekg_cube_reader;
GRANT SELECT ON public.loan_exceptions TO ekg_cube_reader;
GRANT SELECT ON public.portfolio_exceptions TO ekg_cube_reader;

ALTER TABLE public.loan_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_run FORCE ROW LEVEL SECURITY;
CREATE POLICY loan_run_tenant_isolation ON public.loan_run
  FOR SELECT TO ekg_cube_reader
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE public.loan_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_fact FORCE ROW LEVEL SECURITY;
CREATE POLICY loan_fact_tenant_isolation ON public.loan_fact
  FOR SELECT TO ekg_cube_reader
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE public.loan_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY loan_exceptions_tenant_isolation ON public.loan_exceptions
  FOR SELECT TO ekg_cube_reader
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE public.portfolio_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY portfolio_exceptions_tenant_isolation ON public.portfolio_exceptions
  FOR SELECT TO ekg_cube_reader
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);