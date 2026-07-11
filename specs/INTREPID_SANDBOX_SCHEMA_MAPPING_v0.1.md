# Intrepid Sandbox Schema Mapping Contract v0.1

This contract defines the first production-aligned shape that an Intrepid non-production database must expose before the Enterprise Knowledge Graph can treat it as a valid Cube-backed source.

## Reader And Action

This document is for the dev/ops or data engineer responsible for connecting an Intrepid sandbox database to the EKG POC. After reading it, they should be able to verify whether a sandbox schema can support the Intrepid Cube models without exposing credentials or requiring production data.

## Source Profile

The accepted POC source is a PostgreSQL-compatible, non-production Intrepid database. It can be a shared sandbox, an ephemeral restore, or a local Docker database seeded from non-sensitive test data.

Required source facts:

- Database engine: PostgreSQL-compatible.
- Database version: record the exact version during sandbox verification.
- Schema name: provided by `INTREPID_CUBE_SCHEMA`; `public` is the POC default.
- Tenant scope: every semantic query must filter by `INTREPID_TENANT_ID`.
- Production safety: the verifier refuses to run unless `INTREPID_SANDBOX_VERIFY=non-production` is present.

## Required Environment Variables

The verifier reads local values from `cube/.env` or the current shell. These values must not be committed.

```env
INTREPID_POSTGRES_HOST=
INTREPID_POSTGRES_PORT=
INTREPID_POSTGRES_DB=
INTREPID_POSTGRES_USER=
INTREPID_POSTGRES_PASSWORD=
INTREPID_POSTGRES_CONTAINER=
INTREPID_CUBE_SCHEMA=
INTREPID_TENANT_ID=
INTREPID_SANDBOX_VERIFY=non-production
```

## Expected Cube Tables

The current Cube models expect these physical tables:

| Physical table | Cube model | Purpose |
| --- | --- | --- |
| `loan_run` | `intrepid_loan_runs` | One row per tenant-scoped loan processing run. |
| `loan_fact` | `intrepid_loans` | One row per loan in a processing run. |
| `loan_exceptions` | `intrepid_loan_exceptions` | Loan-level rule exceptions. |
| `portfolio_exceptions` | `intrepid_portfolio_exceptions` | Portfolio-level rule exceptions. |

The Cube model schema prefix comes from `INTREPID_CUBE_SCHEMA`.

## Required Columns

### loan_run

| Column | Semantic use |
| --- | --- |
| `tenant_id` | Tenant isolation filter and join key. |
| `run_id` | Processing run identifier. |
| `as_of_date` | Business date for the run. |
| `portfolio` | Portfolio or pool label. |
| `irr_target` | Target yield measure. |
| `status` | Run state surfaced to the semantic record. |
| `created_at` | Ordering and audit timestamp. |
| `updated_at` | Audit timestamp. |
| `started_at` | Run lifecycle timestamp. |
| `completed_at` | Run lifecycle timestamp. |

### loan_fact

| Column | Semantic use |
| --- | --- |
| `tenant_id` | Tenant isolation filter and join key. |
| `run_id` | Join to `loan_run`. |
| `seller_loan_no` | Loan identifier and join to loan exceptions. |
| `original_balance` | Loan balance measure. |
| `current_balance` | Loan balance measure. |
| `purchase_price` | Purchase price measure. |
| `price_pct` | Average price percentage measure. |
| `has_exceptions` | Loan exception flag. |
| `status` | Loan state. |
| `created_at` | Audit timestamp. |

### loan_exceptions

| Column | Semantic use |
| --- | --- |
| `exception_id` | Preferred exception key. |
| `tenant_id` | Tenant isolation filter and join key. |
| `run_id` | Join to `loan_run`. |
| `seller_loan_no` | Join to `loan_fact`. |
| `rule_id` | Rule identifier. |
| `exception_type` | Exception category. |
| `severity` | Exception priority. |
| `message` | Human-readable explanation. |
| `metric_name` | Metric that failed validation. |
| `expected_value` | Expected metric value. |
| `actual_value` | Observed metric value. |
| `difference` | Numeric variance. |
| `balance_impact` | Financial impact measure. |
| `original_balance` | Loan balance context. |
| `purchase_price` | Purchase price context. |
| `created_at` | Audit timestamp. |

### portfolio_exceptions

| Column | Semantic use |
| --- | --- |
| `exception_id` | Preferred exception key. |
| `tenant_id` | Tenant isolation filter and join key. |
| `run_id` | Join to `loan_run`. |
| `rule_id` | Rule identifier. |
| `exception_type` | Exception category. |
| `platform` | Source platform context. |
| `expected_value` | Expected metric value. |
| `actual_value` | Observed metric value. |
| `difference` | Numeric variance. |
| `balance_impact` | Financial impact measure. |
| `severity` | Exception priority. |
| `created_at` | Audit timestamp. |

## Relationship Rules

All Intrepid joins are tenant-scoped.

| Relationship | Join keys |
| --- | --- |
| Loan run to loans | `tenant_id`, `run_id` |
| Loan run to loan exceptions | `tenant_id`, `run_id` |
| Loan run to portfolio exceptions | `tenant_id`, `run_id` |
| Loan to loan exceptions | `tenant_id`, `run_id`, `seller_loan_no` |

The semantic layer must not query Intrepid data without a tenant filter. The POC uses `INTREPID_TENANT_ID`; later production work can replace this with request-scoped tenant context or row-level security claims.

## Transformations Into The Semantic Model

The Cube-backed Intrepid adapter converts the verified tables into a `LoanProcessingRun` semantic record.

| Semantic field | Source |
| --- | --- |
| `entityId` | `loan_run.run_id` |
| `tenantId` | `loan_run.tenant_id` |
| `status` | `loan_run.status` |
| `asOfDate` | `loan_run.as_of_date` |
| `totalLoans` | Count of `loan_fact` rows for the tenant/run. |
| `loansWithExceptions` | Count of `loan_exceptions` rows for the tenant/run. |
| `balanceImpact` | Sum of `loan_exceptions.balance_impact` for the tenant/run. |
| `HAS_LOAN_EXCEPTION` relationship | Aggregate loan exception count and balance impact. |
| `HAS_PORTFOLIO_EXCEPTION` relationship | Aggregate portfolio exception presence for the tenant/run. |
| `SOURCE_NODE` relationship | Intrepid sandbox source node identifier. |

## Read-Only Verification

Install PostgreSQL client tools so `psql` is available on `PATH`, then run the direct verifier:

```bash
npm run verify:intrepid:sandbox-mapping
```

The verifier:

- Loads local values from `cube/.env` when present.
- Requires `INTREPID_SANDBOX_VERIFY=non-production`.
- Connects with the configured Postgres user.
- Reads only `information_schema.columns`.
- Prints table and column metadata, but never prints the password.
- Fails if any required table or column is missing.

For the local Docker POC database, run the Docker-backed verifier:

```bash
npm run verify:intrepid:sandbox-mapping:docker
```

Docker mode uses `docker exec` against `INTREPID_POSTGRES_CONTAINER`, defaulting to `deploy-postgres-1`, and runs the same read-only metadata query inside the Postgres container. Use this when Windows `localhost` or Docker service-name resolution does not point to the expected database.

These commands are intentionally local-only. They must not be added to GitHub Actions until a disposable or managed non-production database is available to the hosted runner.

## Tenant Safety Verification

Run the tenant-safety verifier after Cube model or Intrepid adapter changes:

```bash
npm run verify:intrepid:tenant-safety
```

The verifier is static and CI-safe. It checks that Intrepid Cube joins include `tenant_id` and that the Cube-backed adapter sends explicit tenant filters for run, loan, and exception queries. This does not replace database RLS; it preserves the POC guardrail that semantic reads must be tenant-scoped even before production RLS/session-context wiring is finalized.
## CI Contract

Hosted CI should continue to validate only deterministic assets:

- TypeScript build.
- Factory rig in default mock mode.
- Cube scaffold validation.
- Script syntax and required file/content checks.

Hosted CI must not require live Intrepid credentials for v0.1.