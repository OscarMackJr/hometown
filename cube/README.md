# Cube POC Scaffold

This directory contains the local Cube Open Source scaffold for the Enterprise Knowledge Graph POC.

The scaffold is intentionally connection-safe. It defines the shape of the semantic layer without requiring real AWS, Azure, CRM, ledger, or Intrepid database credentials in CI.

## What This Provides

- A local Docker Compose entry for Cube.
- Placeholder environment variables for CRM and ledger data sources.
- Initial YAML semantic models for:
  - `enterprise_customer`
  - `financial_ledger_account`
  - `intrepid_loan_runs`
  - `intrepid_loans`
  - `intrepid_loan_exceptions`
  - `intrepid_portfolio_exceptions`
- Customer-to-ledger relationship fields for the first GraphRAG slice.
- Tenant-aware Intrepid loan run, loan, and exception model stubs.
- A CI-safe validation script that checks scaffold structure without connecting to live databases.

## Required Environment Variables

Copy the example file before running Cube locally:

```bash
cp cube/.env.example cube/.env
```

Then fill in local or non-production values:

```env
AWS_POSTGRES_CRM_URL=
AZURE_SQL_LEDGER_URL=
CUBEJS_API_SECRET=
```

Do not commit `cube/.env`. Real database URLs and API secrets must come from local developer configuration or managed cloud secret stores.

## Local Run

From the `cube` directory:

```bash
docker compose up
```

Cube will use the mounted repository configuration and expose:

- HTTP API on `http://localhost:4000`
- SQL API on `localhost:15432`

The current scaffold maps Cube's default database URL to `AWS_POSTGRES_CRM_URL` so the CRM slice can be brought up first. The Azure ledger URL and Intrepid loan engine source are reserved for later multi-source wiring steps.

## What Is Mocked

The repository still uses the existing TypeScript integration mocks for the Dark Factory validation rig. Those mocks prove the integration contract and Zod validation path.

The Cube scaffold does not yet connect to real CRM, ledger, or Intrepid databases in CI. CI validates only that:

- Required scaffold files exist.
- Required environment variables are present and blank in the example file.
- Required semantic model names are present.
- Customer-to-ledger relationship fields are present.
- Intrepid loan models include tenant-aware keys and joins.
- No live-looking credentials are committed in the Cube example env file.

## Next Step

After this scaffold lands, the next slice should add a non-production Cube connection profile and a tiny query smoke test against disposable or sandbox data. Intrepid live connectivity should preserve tenant context through row-level security or explicit `tenant_id` filters.
