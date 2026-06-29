# Intrepid Sandbox Schema Mapping v0.1

This note records the verified Intrepid loan engine schema contract used by the Cube semantic layer.

## Source Reviewed

- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\db\sql\loan_run.sql`
- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\db\sql\loan_fact.sql`
- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\db\sql\loan_exceptions.sql`
- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\db\sql\portfolio_exceptions.sql`
- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\db\sql\sp_migrate_loan_run.sql`
- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\db\sql\sp_alter_loan_fact.sql`
- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\db\sql\sp_alter_Loan_exceptions.sql`
- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\backend\routes\runs.ts`
- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\backend\routes\summary.ts`
- `C:\Users\OMack\Intrepid\pythonFramework\loan_engine\backend\__tests__\tenantIsolation.test.ts`

## Verified Tables

The current Cube stubs should continue to target these physical tables:

- `public.loan_run` -> Cube model `intrepid_loan_runs`
- `public.loan_fact` -> Cube model `intrepid_loans`
- `public.loan_exceptions` -> Cube model `intrepid_loan_exceptions`
- `public.portfolio_exceptions` -> Cube model `intrepid_portfolio_exceptions`

## Tenant Contract

The operational backend sets tenant context with `set_config('app.tenant_id', tenantId, true)` and also applies explicit `tenant_id` filters in routes while RLS stabilizes.

The EKG semantic layer must preserve tenant scope by filtering every Intrepid query with `INTREPID_TENANT_ID` and joining Intrepid tables on:

- `tenant_id`
- `run_id`
- `seller_loan_no` for loan-level exception joins

## Required Business Fields

`loan_run`:

- `tenant_id`
- `run_id`
- `as_of_date`
- `portfolio`
- `irr_target`
- `status`
- `created_at`
- `updated_at`
- `started_at`
- `completed_at`

`loan_fact`:

- `tenant_id`
- `run_id`
- `seller_loan_no`
- `original_balance`
- `current_balance`
- `purchase_price`
- `price_pct`
- `has_exceptions`
- `status`
- `created_at`

`loan_exceptions`:

- `exception_id`
- `tenant_id`
- `run_id`
- `seller_loan_no`
- `rule_id`
- `exception_type`
- `severity`
- `message`
- `metric_name`
- `expected_value`
- `actual_value`
- `difference`
- `balance_impact`
- `original_balance`
- `purchase_price`
- `created_at`

`portfolio_exceptions`:

- `exception_id`
- `tenant_id`
- `run_id`
- `rule_id`
- `exception_type`
- `platform`
- `expected_value`
- `actual_value`
- `difference`
- `balance_impact`
- `severity`
- `created_at`

## Sandbox Query Path

Use the sandbox profile and query script after creating `cube/.env` with non-production values:

```bash
cd cube
docker compose -f docker-compose.intrepid-sandbox.yml up
```

Then, from the repository root:

```bash
npm run query:cube:intrepid:sandbox
```

Optional filters:

- `CUBE_SANDBOX_URL` defaults to `http://localhost:4000`.
- `INTREPID_SANDBOX_RUN_ID` narrows the query to one expected run.

This script is intentionally not part of CI because it requires real sandbox credentials. CI continues to use the disposable smoke database.
