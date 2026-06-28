# Nexus CRM Integration Notes

Version: 0.1  
Source reviewed: `C:\Users\OMack\nexus\Nexus-CRM`  
Status: Draft integration notes  
Audience: EKG implementers, CRM engineers, semantic model owners, agent orchestration developers  
Primary post-read action: Use these notes to plan future Nexus CRM integration work without bypassing CRM ownership, authorization, or domain semantics.

## 1. Architecture Summary

Nexus CRM is a Python/FastAPI backend with a React/Vite frontend, Postgres persistence, Redis support, Celery workers, Alembic migrations, Docker Compose development deployment, and Terraform deployment definitions.

The backend is the important integration surface for the EKG project. It contains:

- SQLAlchemy ORM models for CRM entities.
- Pydantic request/response schemas.
- Service classes that apply org scoping, owner checks, team visibility, private-record visibility, pagination, and soft-delete behavior.
- FastAPI route modules under `/api/v1`.
- Auth and role helpers.
- A currently stubbed AI route namespace.

The EKG should treat Nexus CRM as an owned divisional system, not as a raw table pile. Direct SQL access is useful for Cube modeling and read-only semantic projections, but business authorization rules currently live in the CRM service layer.

## 2. Primary Domain Entities

The CRM database model includes these semantic candidates:

| CRM Model | Table | EKG Candidate | Notes |
| --- | --- | --- | --- |
| Organization | `organizations` | Organization | Required for tenant/org scoping. |
| Team | `teams` | Team | Used for deal visibility and ownership grouping. |
| User | `users` | User / RelationshipOwner | Owns companies, contacts, deals, tasks, and AI queries. |
| Company | `companies` | EnterpriseCustomer / Company | Strongest initial match for `enterprise_customer`. |
| Contact | `contacts` | Person / Contact | Links to companies and deals; includes coverage persons. |
| ContactCoveragePerson | `contact_coverage_persons` | Coverage edge | Many-to-many contact-to-user relationship. |
| Deal | `deals` | Opportunity / Deal | Richest business object; must respect team and private visibility. |
| DealActivity | `deal_activities` | Interaction / Activity | Useful GraphRAG context but may contain sensitive notes. |
| Pipeline | `pipelines` | Pipeline | Defines sales/deal workflow context. |
| PipelineStage | `pipeline_stages` | PipelineStage | Drives stage, probability, won/lost status, rotting calculations. |
| Fund | `funds` | Fund | Investment context for private-equity workflows. |
| DealFunding | `deal_funding` | FundingCommitment | Deal-level financial backing context. |
| DealCounterparty | `deal_counterparties` | Counterparty | Deal-related external party context. |
| DealTeamMember | `deal_team_members` | DealTeamMembership edge | Team-user association for a deal. |
| RefData | `ref_data` | ReferenceTerm | Labels categories such as company type, sector, source type, transaction type. |
| AIQuery | `ai_queries` | AIQueryAudit | Existing audit sink for future CRM AI assistant traces. |

The first EKG CRM slice should start with Company, Contact, Deal, DealActivity, Fund, DealFunding, DealCounterparty, User, Team, Pipeline, PipelineStage, and RefData. Boards, tasks, pages, and automations can wait unless the assistant use case needs workflow context.

## 3. Current API Surface

The active REST surface is mounted under `/api/v1`.

High-value routes for future EKG integration:

- `/companies`: list, create, get, update, archive, contacts, deals.
- `/contacts`: list, create, get, update, archive, deals, activities.
- `/deals`: list, create, get, update, archive, move stage, activities.
- `/deals/{deal_id}/funding`: deal funding entries.
- `/deals/{deal_id}/counterparties`: deal counterparties.
- `/funds`: fund records.
- `/admin/ref-data`: reference data labels.
- `/auth/me`: current user identity.
- `/ai`: currently a stub namespace and a good home for future CRM assistant endpoints.

The AI route currently has only router registration. There is no implemented GraphRAG CRM endpoint yet.

## 4. Authorization and Visibility Rules

Future EKG integrations must preserve these CRM rules:

- Most service queries scope data to `current_user.org_id`.
- Companies and contacts use soft archive flags and hide archived records by default.
- Deals are filtered by organization, accessible team IDs, and private-deal visibility.
- Private deals are visible only when `Deal.is_private` is false or the current user owns the deal.
- Deal-related views apply team visibility from `accessible_team_ids`.
- Mutating operations commonly require owner or admin/manager-plus authorization.
- Admin reference and user/group operations require admin role checks.

Do not build a CRM GraphRAG path that reads raw CRM tables and bypasses these rules. If Cube queries the CRM database directly, the orchestration layer still needs an authorization-aware filter strategy before context reaches an LLM.

## 5. Recommended Integration Boundary

Use two integration modes:

### Mode A: Authorized API/Service Integration

Use this for user-facing CRM assistant requests.

The CRM assistant should call CRM service methods or API endpoints using the active user context, then transform the authorized response into a `SemanticRecord`. This is safest for GraphRAG because it reuses CRM authorization and visibility rules.

Recommended first implementation:

- Add a backend CRM semantic-context endpoint under the existing `/api/v1/ai` namespace.
- Require the active authenticated user.
- Accept an entity type and entity id.
- Use existing service classes to fetch authorized company/contact/deal context.
- Return a compact, structured JSON payload for the EKG orchestration layer.

### Mode B: Cube Read Model Integration

Use this for semantic layer modeling, dashboards, and read-only aggregate context.

Cube can map CRM tables to business concepts, but model definitions must account for org scoping and record visibility. The first Cube CRM model should not expose sensitive notes or private deal rows until row-level filtering is designed.

Recommended first Cube mappings:

- `crm_companies` from `companies`.
- `crm_contacts` from `contacts`.
- `crm_deals` from `deals`.
- `crm_deal_activities` from `deal_activities`, with sensitive fields excluded initially.
- `crm_ref_data` from `ref_data`.

## 6. Suggested Semantic Record Mapping

### Company as Enterprise Customer

Use Company as the first concrete CRM source for `enterprise_customer`.

Suggested record:

- `entityId`: `company.id`
- `entityName`: `company.name`
- `attributes.domain`: `company.domain`
- `attributes.industry`: `company.industry`
- `attributes.sizeRange`: `company.size_range`
- `attributes.annualRevenue`: `company.annual_revenue`
- `attributes.ownerId`: `company.owner_id`
- `attributes.ownerName`: service response owner name
- `attributes.tags`: `company.tags`
- `attributes.riskHints`: derived later from watchlist, lifecycle, deal history, or financial ledger context
- `attributes.legacyId`: `company.legacy_id`
- `relationships`: contacts, deals, owner, parent company, source node

Suggested relationships:

- `OWNED_BY` -> user id
- `HAS_CONTACT` -> contact id
- `HAS_DEAL` -> deal id
- `PARENT_OF` or `CHILD_OF` -> related company id
- `CLASSIFIED_AS` -> ref data ids for company type, tier, sector, sub-sector
- `SOURCE_NODE` -> `Nexus_CRM_Postgres`

### Contact as Person

Suggested record:

- `entityId`: `contact.id`
- `entityName`: first and last name
- `attributes.email`: email
- `attributes.title`: title
- `attributes.lifecycleStage`: lifecycle stage
- `attributes.leadScore`: lead score
- `attributes.companyId`: company id
- `attributes.ownerId`: owner id
- `relationships`: company, owner, coverage persons, deals, activities

Suggested relationships:

- `WORKS_FOR` -> company id
- `OWNED_BY` -> user id
- `COVERED_BY` -> user id
- `PARTICIPATES_IN_DEAL` -> deal id
- `HAS_ACTIVITY` -> activity id

### Deal as Opportunity

Suggested record:

- `entityId`: `deal.id`
- `entityName`: `deal.name`
- `attributes.status`: status
- `attributes.value`: value
- `attributes.currency`: currency
- `attributes.probability`: probability
- `attributes.stageName`: stage name
- `attributes.pipelineName`: pipeline name
- `attributes.expectedCloseDate`: expected close date
- `attributes.isPrivate`: private flag
- `attributes.financials`: revenue, EBITDA, enterprise value, equity investment, bids
- `relationships`: company, contact, owner, team, fund, pipeline, stage, counterparties, funding, activities

Suggested relationships:

- `BELONGS_TO_COMPANY` -> company id
- `PRIMARY_CONTACT` -> contact id
- `OWNED_BY` -> user id
- `ASSIGNED_TO_TEAM` -> team id
- `IN_PIPELINE` -> pipeline id
- `IN_STAGE` -> stage id
- `FUNDED_BY` -> fund id
- `HAS_COUNTERPARTY` -> counterparty id
- `HAS_FUNDING_ENTRY` -> funding id
- `HAS_ACTIVITY` -> activity id

## 7. Cube Model Impact

The current EKG Cube scaffold uses placeholder tables:

- `public.customers`
- `dbo.ledger_accounts`

For Nexus CRM, the customer model should be adjusted to use CRM tables:

- Replace or augment `enterprise_customer` with a source model over `companies`.
- Keep the enterprise concept name stable, but track `sourceNode = Nexus_CRM_Postgres`.
- Join companies to contacts through `contacts.company_id`.
- Join companies to deals through `deals.company_id`.
- Join deals to pipeline stages, pipelines, funds, deal funding, and counterparties as later slices.

For a CI-safe first step, keep the Cube model validation structural. Do not require live CRM database access in CI.

## 8. GraphRAG Integration Path

Recommended first CRM GraphRAG slice:

1. User opens a company in Nexus CRM.
2. CRM assistant asks for company context.
3. Backend authenticates the user and loads authorized company context.
4. Backend includes related contacts, visible deals, and non-private recent activities.
5. EKG orchestration transforms the payload into one `enterprise_customer` record plus relationships.
6. Dark Factory validation verifies the semantic record shape.
7. LLM receives structured context and is instructed not to invent missing CRM fields.
8. AIQuery or a future trace table stores prompt lineage, record ids, and response metadata.

Do not include private deal activity bodies, LinkedIn tokens, auth credentials, or unrestricted custom fields in the first prompt payload.

## 9. Security Notes

Important security considerations for future integration:

- `linkedin_access_token` exists on User and must never be emitted to the EKG or LLM.
- Activity bodies may contain sensitive business commentary and should be filtered or summarized.
- `custom_fields` is flexible JSON and should be allowlisted before prompt use.
- Org scoping is mandatory for every user-facing semantic query.
- Deal team/private visibility is mandatory for deal context.
- Direct Cube reads need a row-level filtering design before production user-facing use.
- AIQuery currently stores generated SQL and summaries; future GraphRAG traces should avoid storing secrets or unrestricted raw prompts.

## 10. Implementation Notes for Future Integrations

Recommended next engineering tasks:

1. Add Nexus CRM-specific Cube model files for companies, contacts, deals, and ref data.
2. Add a CRM semantic adapter in the EKG project that maps CRM responses to `SemanticRecord`.
3. Add a contract fixture that validates one company, one contact, and one deal as semantic records.
4. Add a user-authorized `/api/v1/ai/context/company/{company_id}` endpoint in Nexus CRM.
5. Add prompt payload redaction rules for activity bodies and custom fields.
6. Add lineage metadata: CRM table/entity, source id, org id, and retrieval timestamp.
7. Add an integration test that proves private deals are not emitted for unauthorized users.

## 11. Open Questions

- Should the EKG read Nexus CRM through API/service calls only, or also through Cube direct database models?
- What is the canonical enterprise customer concept: CRM Company, external account, ledger entity, or a resolved identity that can point to all three?
- Which CRM fields are safe for LLM prompt payloads by default?
- Should AIQuery be extended for GraphRAG lineage, or should EKG own a separate trace store?
- How should user authorization be represented when EKG orchestration runs outside the CRM backend process?
- What is the first real business question the CRM assistant must answer using cross-divisional ledger context?

## 12. Review Findings

No blocking issue prevents future EKG integration planning, but the current CRM architecture creates two important constraints:

- The AI route is only a stub, so GraphRAG integration will need a new backend endpoint or service.
- Authorization lives in CRM services and helper functions, so direct semantic-layer reads must not become the user-facing access path until row-level security and visibility filters are designed.
