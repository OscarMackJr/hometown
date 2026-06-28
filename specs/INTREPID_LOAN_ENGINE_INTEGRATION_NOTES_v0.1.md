# Intrepid Loan Engine Integration Notes

Version: 0.1  
Source reviewed: `C:\Users\OMack\Intrepid\pythonFramework\loan_engine`  
Status: Draft integration notes  
Audience: EKG implementers, loan operations engineers, semantic model owners, agent orchestration developers  
Primary post-read action: Use these notes to plan future Intrepid loan-processing integrations without bypassing tenant isolation, RLS, file-artifact boundaries, or rule provenance.

## 1. Architecture Summary

The Intrepid loan engine is a back-office loan portfolio processing system. It ingests loan tape and supporting workbook inputs, executes Python-based rule and reconciliation pipelines, persists run/exception/fact data in Postgres, and exposes operational views through an Express/TypeScript API and React/Vite frontend.

Major components:

- React/TypeScript frontend for run lists, summaries, exceptions, and pipeline execution.
- Node.js/Express TypeScript backend for API orchestration.
- Python pipeline engine for dataset building, tape reconciliation, purchase price checks, CoMAP checks, eligibility checks, and artifact exports.
- PostgreSQL database for loan runs, loan facts, loan exceptions, portfolio exceptions, rule configuration, and tenant metadata.
- File-system artifacts for engine inputs, borrowing files, ratios, exception extracts, flagged-loan workbooks, and run manifests.
- Okta JWT middleware and tenant resolution for production access.
- PostgreSQL row-level security using `app.tenant_id` session context.

## 2. Primary Domain Entities

| Source Concept | Table / File / Module | EKG Candidate | Notes |
| --- | --- | --- | --- |
| Tenant | `tenant`, `user_tenant`, JWT group mapping | Tenant / Division | Required boundary for all semantic reads. |
| Loan Run | `loan_run` | LoanProcessingRun | Operational parent for a portfolio processing cycle. |
| Loan Fact | `loan_fact` | Loan | Loan-level facts and balances for a run. |
| Loan Exception | `loan_exceptions` | LoanRuleException | Loan-level rule failures. |
| Portfolio Exception | `portfolio_exceptions` | PortfolioRuleException | Portfolio-level ratio and eligibility failures. |
| Rule Master | `rule_master` | RuleDefinition | Rule metadata and severity. |
| Purchase Price Config | `rule_purchase_price_config` | RuleConfiguration | Effective-dated tolerance settings. |
| Eligibility Config | `rule_eligibility_config` | RuleConfiguration | Effective-dated portfolio ratio settings. |
| CoMAP Config | Python defaults / optional workbook | RuleConfiguration | FICO/program eligibility rules. |
| Run Manifest | `run_manifest.json` | RunArtifactManifest | Artifact lineage and counts. |
| Output Artifacts | CSV/XLSX files under output directories | ProcessingArtifact | Generated evidence for analysts and downstream systems. |

The first EKG slice should model `LoanProcessingRun`, `Loan`, `LoanRuleException`, `PortfolioRuleException`, `RuleDefinition`, `RuleConfiguration`, and `ProcessingArtifact`.

## 3. API Surface

The active backend mounts these routes under `/api`:

- `/api/runs`: list and paginate loan runs.
- `/api/summary/:runId`: get run-level summary metrics.
- `/api/exceptions`: list loan-level exceptions for a run.
- `/api/portfolio-exceptions/:runId`: list portfolio-level exceptions for a run.
- `/api/pipeline/run`: start a Python pipeline run.

Additional route files exist, but not all are mounted. In particular, a loan-detail route exists that reads `loan_fact` and `loan_exceptions` directly without tenant middleware or `withTenant`; it is not mounted in the reviewed app configuration. Future integration work must not copy that pattern.

## 4. Tenant and Security Model

The backend enforces tenant context on mounted `/api` routes:

- In production, JWT auth is required.
- Okta groups are mapped to tenant ids using `tenant:<uuid>` or `loanengine:tenant:<uuid>` conventions.
- Non-production may accept `X-Tenant-Id` or `DEFAULT_TENANT_ID`.
- Tenant ids are validated as UUIDs.
- Database access should run through `withTenant`, which starts a transaction and sets `app.tenant_id`.
- RLS policies use `tenant_id = app.current_tenant_id()`.
- Backend tests explicitly verify tenant isolation for runs, summaries, portfolio exceptions, and loan exceptions.

Future EKG integration must preserve tenant context. Direct database reads through Cube or another semantic layer must either:

- Execute with a tenant-scoped database role and `app.tenant_id` session context, or
- Apply explicit `tenant_id` filters in every semantic model and query.

RLS should be treated as a safety boundary, not the only boundary.

## 5. Processing Flow

The main pipeline flow is:

1. API receives `/api/pipeline/run` with a run id, workbook paths, optional tape/servicing/CoMAP paths, output directory, and dry-run flag.
2. API validates required server-side file paths.
3. API creates or updates `loan_run` as `RUNNING` for the current tenant.
4. API spawns Python `run_pipeline.py` with input paths, output directory, run id, tenant id, and optional DB URL from server environment.
5. Python builds the engine input CSV from Exhibit A and master workbooks.
6. Optional tape and servicing reconciliation enrich the loan dataset.
7. Purchase price, CoMAP, and eligibility rules produce exceptions and metrics.
8. Python writes CSV/XLSX artifacts and `run_manifest.json`.
9. If DB URL is available and not dry-run, Python persists exceptions and metrics.
10. API updates `loan_run` as `SUCCEEDED` or `FAILED`.

The processing flow is both data-producing and evidence-producing. EKG should retain links to run artifacts and manifest metadata, not only database rows.

## 6. Semantic Record Mapping

### Loan Processing Run

Suggested `SemanticRecord`:

- `entityId`: `run_id`
- `entityName`: `Loan Processing Run {run_id}`
- `attributes.tenantId`: tenant id
- `attributes.asOfDate`: run as-of date
- `attributes.portfolio`: portfolio name/id
- `attributes.status`: run status
- `attributes.irrTarget`: IRR target
- `attributes.startedAt`: started timestamp
- `attributes.completedAt`: completed timestamp
- `attributes.exceptionCount`: derived from exceptions
- `attributes.artifactManifest`: manifest path or parsed manifest summary

Suggested relationships:

- `HAS_LOAN` -> loan ids from `loan_fact`
- `HAS_LOAN_EXCEPTION` -> exception ids from `loan_exceptions`
- `HAS_PORTFOLIO_EXCEPTION` -> exception ids from `portfolio_exceptions`
- `PRODUCED_ARTIFACT` -> artifact paths from manifest
- `BELONGS_TO_TENANT` -> tenant id
- `SOURCE_NODE` -> `Intrepid_Loan_Engine_Postgres`

### Loan

Suggested `SemanticRecord`:

- `entityId`: `{tenant_id}:{run_id}:{seller_loan_no}`
- `entityName`: `Loan {seller_loan_no}`
- `attributes.runId`: run id
- `attributes.sellerLoanNo`: seller loan number
- `attributes.originalBalance`: original balance
- `attributes.currentBalance`: current balance
- `attributes.purchasePrice`: purchase price
- `attributes.pricePct`: price percent
- `attributes.status`: loan status
- `attributes.hasExceptions`: exception flag

Suggested relationships:

- `PART_OF_RUN` -> run id
- `HAS_EXCEPTION` -> loan exception ids
- `BELONGS_TO_TENANT` -> tenant id

### Loan Rule Exception

Suggested `SemanticRecord`:

- `entityId`: exception id or `{tenant_id}:{run_id}:{seller_loan_no}:{rule_id}`
- `entityName`: `{exception_type} exception for {seller_loan_no}`
- `attributes.ruleId`: rule id
- `attributes.exceptionType`: exception type
- `attributes.severity`: severity
- `attributes.expectedValue`: expected value
- `attributes.actualValue`: actual value
- `attributes.difference`: difference
- `attributes.balanceImpact`: balance impact
- `attributes.createdAt`: creation timestamp

Suggested relationships:

- `APPLIES_TO_LOAN` -> loan id
- `PART_OF_RUN` -> run id
- `TRIGGERED_BY_RULE` -> rule id
- `BELONGS_TO_TENANT` -> tenant id

### Portfolio Rule Exception

Suggested `SemanticRecord`:

- `entityId`: portfolio exception id or `{tenant_id}:{run_id}:{rule_id}`
- `entityName`: `Portfolio exception {rule_id}`
- `attributes.platform`: platform
- `attributes.exceptionType`: exception type
- `attributes.severity`: severity
- `attributes.expectedValue`: expected value
- `attributes.actualValue`: actual value
- `attributes.difference`: difference
- `attributes.balanceImpact`: balance impact

Suggested relationships:

- `PART_OF_RUN` -> run id
- `TRIGGERED_BY_RULE` -> rule id
- `BELONGS_TO_TENANT` -> tenant id

## 7. Cube Model Impact

Future Cube models for Intrepid should be separate from the CRM and ledger models.

Recommended initial cubes:

- `intrepid_loan_runs`
- `intrepid_loans`
- `intrepid_loan_exceptions`
- `intrepid_portfolio_exceptions`
- `intrepid_rule_configurations`

Required modeling constraints:

- Include `tenant_id` in all cubes where present.
- Join `loan_fact` to `loan_run` by both `tenant_id` and `run_id`.
- Join `loan_exceptions` to `loan_fact` by `tenant_id`, `run_id`, and `seller_loan_no`.
- Do not rely on `run_id` alone; migrations replaced global run uniqueness with tenant-scoped uniqueness.
- Exclude or redact fields that may contain raw analyst notes or sensitive exception messages until a prompt allowlist exists.

Cube validation can stay structural in CI. Do not require live Intrepid database connectivity in the first EKG integration PR.

## 8. GraphRAG Integration Path

Recommended first GraphRAG slice:

1. User asks about a completed loan processing run.
2. Orchestration receives tenant id, run id, and authenticated user context.
3. Intrepid backend or EKG adapter loads run summary through tenant-safe API or `withTenant`-equivalent database context.
4. Adapter expands to portfolio exceptions and top loan exceptions by severity and balance impact.
5. Adapter optionally expands selected loan details only for the requested tenant and run.
6. Adapter emits one `LoanProcessingRun` semantic record with relationships to exception and loan records.
7. Dark Factory validation verifies the semantic record shape.
8. LLM receives a compact, explicit payload with run summary, exception counts, high-impact rules, and artifact lineage.

The first prompt payload should not include unrestricted raw workbook contents, server file paths beyond safe artifact identifiers, secrets, or all loan rows. Start with summaries and top exceptions.

## 9. Integration Risks and Findings

### High: Tenant Safety Must Be Preserved Outside Express

The mounted Express routes consistently use `requireTenant` and `withTenant`, and tenant-isolation tests exist. Any EKG direct database integration must recreate this context. A semantic layer that queries `loan_fact` or `loan_exceptions` without tenant context can leak cross-tenant loan data.

### High: Python Persistence Path Needs Tenant Review

`run_pipeline.py` accepts `--tenant-id`, but the reviewed `to_sql` persistence blocks for `loan_exceptions` and `portfolio_metrics` do not visibly add `tenant_id` to the DataFrames before writing. Since RLS policies and later schema migrations expect tenant-scoped rows, this should be fixed or verified before relying on pipeline-written rows for production EKG context.

### Medium: Schema Files Reflect Multiple Historical States

Base SQL files define `loan_run`, `loan_fact`, and `loan_exceptions` without tenant ids, while migration files add `tenant_id`, tenant-scoped uniqueness, RLS, and tenant indexes. Future EKG work should treat the migration/RLS model as authoritative and avoid copying the older base DDL directly.

### Medium: File Path Inputs Are Server-Side Paths

Pipeline APIs accept server-side file paths and output directories. That is workable for controlled back-office processing but should not become an external EKG input surface. EKG should consume run metadata and artifacts after the pipeline completes, not accept arbitrary file paths from users.

### Medium: A Token File Exists in the Source Tree

A file named `gitPAT.txt` exists in the reviewed source tree. Its contents were not read or copied. The Intrepid repo should remove it from source control and rotate any token if it contains a real credential.

### Low: Some Route and Backup Files Are Historical

There are many `.bak`, `.orig`, and duplicate route files. Future integrators should inspect only mounted routes and active pipeline modules unless explicitly modernizing the Intrepid repo.

## 10. Recommended Next Tasks

1. Confirm the production Intrepid schema includes tenant ids and RLS on `loan_run`, `loan_fact`, `loan_exceptions`, and `portfolio_exceptions`.
2. Fix or verify Python persistence so tenant id is written to all tenant-scoped tables.
3. Add an Intrepid semantic adapter in EKG for `LoanProcessingRun`.
4. Add fixtures for one run, two loans, one loan exception, and one portfolio exception.
5. Add Cube model stubs for Intrepid run, loan, and exception cubes with tenant-aware joins.
6. Add a CI-safe scaffold validator for Intrepid models, similar to the current Cube scaffold validator.
7. Add an authorized Intrepid context endpoint or service method that returns run summary plus top exceptions.
8. Add an integration test proving tenant B cannot retrieve tenant A run context through the EKG adapter.

## 11. Open Questions

- Should EKG read Intrepid through the Express API, a direct Postgres semantic layer, or both?
- What is the canonical enterprise identity link between CRM Company and Intrepid loan portfolio or borrower data?
- Which loan fields are safe for LLM context by default?
- Should run artifacts be indexed as semantic metadata only, or should selected generated CSV/XLSX content be parsed into graph records?
- Should portfolio metrics be modeled as exceptions, measurements, or both?
- Should EKG store a copy of run manifest metadata or resolve it on demand from Intrepid artifact storage?

## 12. Integration Recommendation

Start with a tenant-scoped, read-only run context integration. The first POC should answer:

> For this tenant and run, what happened, which rules failed, how many loans were affected, and what were the highest-impact exceptions?

Do not start by exposing arbitrary loan-detail retrieval or raw artifact parsing. The first safe semantic object is the completed run summary plus top validated exceptions.
