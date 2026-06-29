CREATE TABLE public.loan_run (
  tenant_id text NOT NULL,
  run_id text NOT NULL,
  portfolio text NOT NULL,
  status text NOT NULL,
  as_of_date date NOT NULL,
  created_at timestamp NOT NULL,
  started_at timestamp NOT NULL,
  completed_at timestamp,
  irr_target numeric,
  PRIMARY KEY (tenant_id, run_id)
);

CREATE TABLE public.loan_fact (
  tenant_id text NOT NULL,
  run_id text NOT NULL,
  seller_loan_no text NOT NULL,
  status text NOT NULL,
  has_exceptions boolean NOT NULL,
  created_at timestamp NOT NULL,
  original_balance numeric NOT NULL,
  current_balance numeric NOT NULL,
  purchase_price numeric NOT NULL,
  price_pct numeric NOT NULL,
  PRIMARY KEY (tenant_id, run_id, seller_loan_no)
);

CREATE TABLE public.loan_exceptions (
  exception_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  run_id text NOT NULL,
  seller_loan_no text NOT NULL,
  rule_id text NOT NULL,
  exception_type text NOT NULL,
  severity text NOT NULL,
  metric_name text NOT NULL,
  created_at timestamp NOT NULL,
  expected_value numeric,
  actual_value numeric,
  difference numeric,
  balance_impact numeric NOT NULL
);

CREATE TABLE public.portfolio_exceptions (
  exception_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  run_id text NOT NULL,
  rule_id text NOT NULL,
  exception_type text NOT NULL,
  platform text NOT NULL,
  severity text NOT NULL,
  created_at timestamp NOT NULL,
  expected_value numeric,
  actual_value numeric,
  difference numeric,
  balance_impact numeric NOT NULL
);

INSERT INTO public.loan_run (
  tenant_id,
  run_id,
  portfolio,
  status,
  as_of_date,
  created_at,
  started_at,
  completed_at,
  irr_target
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'INTREPID_RUN_2026_Q2_001',
  'SMOKE_PORTFOLIO',
  'SUCCEEDED',
  '2026-06-28',
  '2026-06-28 10:00:00',
  '2026-06-28 10:01:00',
  '2026-06-28 10:02:00',
  0.085
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
  ('11111111-1111-4111-8111-111111111111', 'INTREPID_RUN_2026_Q2_001', 'L1', 'ACTIVE', true, '2026-06-28 10:01:30', 250000.00, 240000.00, 235000.00, 0.9792),
  ('11111111-1111-4111-8111-111111111111', 'INTREPID_RUN_2026_Q2_001', 'L2', 'ACTIVE', false, '2026-06-28 10:01:45', 125000.00, 120000.00, 118500.00, 0.9875);

INSERT INTO public.loan_exceptions (
  exception_id,
  tenant_id,
  run_id,
  seller_loan_no,
  rule_id,
  exception_type,
  severity,
  metric_name,
  created_at,
  expected_value,
  actual_value,
  difference,
  balance_impact
) VALUES (
  'LE-1',
  '11111111-1111-4111-8111-111111111111',
  'INTREPID_RUN_2026_Q2_001',
  'L1',
  'RULE_X',
  'UNDERWRITING',
  'HIGH',
  'ltv',
  '2026-06-28 10:02:00',
  0.80,
  0.87,
  0.07,
  1234.56
);

INSERT INTO public.portfolio_exceptions (
  exception_id,
  tenant_id,
  run_id,
  rule_id,
  exception_type,
  platform,
  severity,
  created_at,
  expected_value,
  actual_value,
  difference,
  balance_impact
) VALUES (
  'PE-1',
  '11111111-1111-4111-8111-111111111111',
  'INTREPID_RUN_2026_Q2_001',
  'P_RULE_1',
  'PORTFOLIO',
  'INTREPID',
  'MED',
  '2026-06-28 10:02:15',
  1,
  2,
  1,
  1234.56
);
