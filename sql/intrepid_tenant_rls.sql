-- Intrepid tenant isolation defense-in-depth migration.
-- Applies the same forced RLS contract used by the local smoke seed to an
-- existing non-production Intrepid-compatible Postgres database.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ekg_cube_reader') THEN
    CREATE ROLE ekg_cube_reader LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO ekg_cube_reader;
GRANT SELECT ON public.loan_run TO ekg_cube_reader;
GRANT SELECT ON public.loan_fact TO ekg_cube_reader;
GRANT SELECT ON public.loan_exceptions TO ekg_cube_reader;
GRANT SELECT ON public.portfolio_exceptions TO ekg_cube_reader;

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
)
SELECT
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
WHERE NOT EXISTS (
  SELECT 1 FROM public.loan_run
  WHERE tenant_id = '22222222-2222-4222-8222-222222222222'::uuid
    AND run_id = 'INTREPID_RUN_2026_Q2_002'
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
)
SELECT
  '22222222-2222-4222-8222-222222222222'::uuid,
  'INTREPID_RUN_2026_Q2_002',
  'L3',
  'ACTIVE',
  true,
  '2026-06-29 10:01:30+00',
  300000.00,
  291000.00,
  286000.00,
  0.9828
WHERE NOT EXISTS (
  SELECT 1 FROM public.loan_fact
  WHERE tenant_id = '22222222-2222-4222-8222-222222222222'::uuid
    AND run_id = 'INTREPID_RUN_2026_Q2_002'
    AND seller_loan_no = 'L3'
);

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
)
SELECT
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
WHERE NOT EXISTS (
  SELECT 1 FROM public.loan_exceptions
  WHERE tenant_id = '22222222-2222-4222-8222-222222222222'::uuid
    AND run_id = 'INTREPID_RUN_2026_Q2_002'
    AND seller_loan_no = 'L3'
    AND rule_id = 'RULE_Y'
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
)
SELECT
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
WHERE NOT EXISTS (
  SELECT 1 FROM public.portfolio_exceptions
  WHERE tenant_id = '22222222-2222-4222-8222-222222222222'::uuid
    AND run_id = 'INTREPID_RUN_2026_Q2_002'
    AND rule_id = 'P_RULE_2'
);

ALTER TABLE public.loan_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_run FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_run_tenant_isolation ON public.loan_run;
CREATE POLICY loan_run_tenant_isolation ON public.loan_run
  FOR SELECT TO ekg_cube_reader
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE public.loan_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_fact FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_fact_tenant_isolation ON public.loan_fact;
CREATE POLICY loan_fact_tenant_isolation ON public.loan_fact
  FOR SELECT TO ekg_cube_reader
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE public.loan_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_exceptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_exceptions_tenant_isolation ON public.loan_exceptions;
CREATE POLICY loan_exceptions_tenant_isolation ON public.loan_exceptions
  FOR SELECT TO ekg_cube_reader
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE public.portfolio_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_exceptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portfolio_exceptions_tenant_isolation ON public.portfolio_exceptions;
CREATE POLICY portfolio_exceptions_tenant_isolation ON public.portfolio_exceptions
  FOR SELECT TO ekg_cube_reader
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);