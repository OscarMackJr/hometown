# Cube POC Scaffold

This directory contains the local Cube Open Source scaffold for the Enterprise Knowledge Graph POC.

The scaffold is intentionally connection-safe. It defines the shape of the semantic layer without requiring real AWS, Azure, CRM, ledger, or Intrepid database credentials in CI.

## What This Provides

- A local Docker Compose entry for Cube.
- Placeholder environment variables for CRM, ledger, and Intrepid data sources.
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
- A disposable Intrepid Cube smoke test that starts local Postgres and Cube containers.

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
INTREPID_POSTGRES_URL=
INTREPID_POSTGRES_HOST=
INTREPID_POSTGRES_PORT=
INTREPID_POSTGRES_DB=
INTREPID_POSTGRES_USER=
INTREPID_POSTGRES_PASSWORD=
INTREPID_CUBE_SCHEMA=
INTREPID_TENANT_ID=
```

Do not commit `cube/.env`. Real database URLs, tenant identifiers, and API secrets must come from local developer configuration or managed cloud secret stores.

## Local Run

From the `cube` directory:

```bash
docker compose up
```

Cube will use the mounted repository configuration and expose:

- HTTP API on `http://localhost:4000`
- SQL API on `localhost:15432`

The current scaffold maps Cube's default database URL to `AWS_POSTGRES_CRM_URL` so the CRM slice can be brought up first. The Azure ledger URL and Intrepid loan engine source are reserved for later multi-source wiring steps.

## Intrepid Cube Smoke Test

Run the disposable Intrepid Cube smoke test with:

```bash
npm run smoke:cube:intrepid
```

The smoke test starts a local Postgres container, seeds one Intrepid loan processing run with related loan and exception rows, starts Cube against that disposable database, and queries `intrepid_loan_runs.count` through the Cube REST API. It uses only local container credentials defined in `cube/docker-compose.intrepid-smoke.yml`; no production or sandbox secrets are required.

The GitHub Actions validation gate also runs this smoke test so pull requests prove that Cube can load the Intrepid models and execute a basic query without connecting to real enterprise data.

## Non-Production Intrepid Profile

The Intrepid profile uses these variables when moving beyond the disposable smoke test:

- `INTREPID_POSTGRES_URL` for a sandbox or ephemeral Postgres-compatible Intrepid database.
- `INTREPID_POSTGRES_HOST`, `INTREPID_POSTGRES_PORT`, `INTREPID_POSTGRES_DB`, `INTREPID_POSTGRES_USER`, and `INTREPID_POSTGRES_PASSWORD` for Cube's explicit Postgres connection settings.
- `INTREPID_CUBE_SCHEMA` for the schema containing Intrepid tables, typically `public` in the POC.
- `INTREPID_TENANT_ID` for tenant-scoped smoke data and future row-level security context.

Start Cube against a non-production Intrepid database with:

```bash
cd cube
docker compose -f docker-compose.intrepid-sandbox.yml up
```

Then query one tenant-scoped Intrepid run through Cube from the repository root:

```bash
npm run query:cube:intrepid:sandbox
```

Set `INTREPID_SANDBOX_RUN_ID` when you want the query to assert a specific run id. This sandbox query is intentionally not part of CI because it requires real non-production credentials.

### Sandbox Schema Mapping Verification

Before treating a non-production Intrepid database as compatible with the Cube models, set `INTREPID_SANDBOX_VERIFY=non-production` in local configuration and run:

```bash
npm run verify:intrepid:sandbox-mapping
```

The verifier reads only Postgres metadata from `information_schema.columns`, prints table and column names, and fails if the required `loan_run`, `loan_fact`, `loan_exceptions`, or `portfolio_exceptions` contract is missing. The mapping contract lives in the specs index.

When the POC database is the local Docker container, avoid Windows host-name and `localhost` ambiguity by running the Docker-backed verifier instead:

```bash
npm run verify:intrepid:sandbox-mapping:docker
```

The Docker mode uses `docker exec` against `INTREPID_POSTGRES_CONTAINER`, defaulting to `deploy-postgres-1`, and runs the same read-only metadata check inside the Postgres container.

### Local Docker Postgres

When the Intrepid POC database is another Docker service, put Cube on the same Docker network and use the Postgres container name as the host. The current sandbox compose profile joins the external `deploy_default` network, which works with the local Postgres container named `deploy-postgres-1`.

Example local-only values for `cube/.env`:

```env
CUBEJS_API_SECRET=local-dev-secret
INTREPID_POSTGRES_HOST=deploy-postgres-1
INTREPID_POSTGRES_PORT=5432
INTREPID_POSTGRES_DB=intrepid_cube_poc
INTREPID_POSTGRES_USER=nexus
INTREPID_POSTGRES_PASSWORD=nexus
INTREPID_POSTGRES_URL=postgresql://nexus:nexus@deploy-postgres-1:5432/intrepid_cube_poc
INTREPID_CUBE_SCHEMA=public
INTREPID_TENANT_ID=11111111-1111-4111-8111-111111111111
```

Do not use `localhost` inside the Cube container for another Docker-hosted Postgres database. In that context, `localhost` points at the Cube container itself.


## Cube-Backed Intrepid Adapter

The Intrepid integration defaults to deterministic mock mode so CI does not require live Cube or database credentials:

```env
INTREPID_INTEGRATION_MODE=mock
```

For local POC verification, start Cube against the local Docker Postgres profile, then run:

```bash
npm run verify:intrepid:cube-adapter
```

That script builds the TypeScript adapter, loads local values from `cube/.env`, sets `INTREPID_INTEGRATION_MODE=cube`, calls the `intrepid_loan_engine` integration, and prints the resulting `SemanticRecord`.
For an end-to-end local proof through the full Dark Factory evaluation rig, run:

```bash
npm run test:factory:intrepid-cube
```

This command loads `cube/.env`, forces `INTREPID_INTEGRATION_MODE=cube`, verifies Cube is reachable, and then runs the same factory rig used by CI. It remains local-only and is not part of GitHub Actions.

## What Is Mocked

The repository still uses the existing TypeScript integration mocks for the Dark Factory validation rig. Those mocks prove the integration contract and Zod validation path.

The Cube scaffold does not yet connect to real CRM, ledger, or Intrepid databases in CI. CI validates only that:

- Required scaffold files exist.
- Required environment variables are present and blank in the example file.
- Required semantic model names are present.
- Customer-to-ledger relationship fields are present.
- Intrepid loan models include tenant-aware keys and joins.
- The disposable Intrepid Cube smoke test can load the models and query seeded data.
- No live-looking credentials are committed in the Cube example env file.

## Next Step

After this scaffold lands, the next slice should replace the smoke schema with a non-production Cube connection profile against sandbox Intrepid data. Intrepid live connectivity should preserve tenant context through row-level security or explicit `tenant_id` filters.

