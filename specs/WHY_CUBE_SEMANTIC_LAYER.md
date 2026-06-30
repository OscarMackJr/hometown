# Why We Are Using Cube

Cube is the semantic layer between raw enterprise databases and the AI/orchestration layer.

In plain English, Cube gives us a governed business API over databases.

Instead of letting the AI assistant, backend code, or every integration directly guess SQL against CRM, ledger, or Intrepid tables, Cube lets us define official business models such as:

- `enterprise_customer`
- `financial_ledger_account`
- `intrepid_loan_runs`
- `intrepid_loans`
- `intrepid_loan_exceptions`

Those models describe:

- Which physical tables matter.
- How tables join.
- Which fields are dimensions.
- Which fields are measures.
- Which names the business should use.
- How tenant filters should be applied.

For example, Cube lets us move from raw SQL like:

```sql
select run_id, status, count(*)
from public.loan_run
where tenant_id = ...
group by run_id, status;
```

To a governed business-model query like:

```json
{
  "measures": ["intrepid_loan_runs.count"],
  "dimensions": ["intrepid_loan_runs.run_id", "intrepid_loan_runs.status"],
  "filters": [
    {
      "member": "intrepid_loan_runs.tenant_id",
      "operator": "equals",
      "values": ["..."]
    }
  ]
}
```

## Why This Matters

Cube helps the Enterprise Knowledge Graph project because it:

- Reduces schema hallucination by the LLM.
- Keeps raw database details out of the assistant.
- Provides one consistent business vocabulary across systems.
- Lets us test semantic models in CI.
- Supports multiple databases behind one semantic API.
- Gives us a path to governed GraphRAG instead of loose document chunking.
- Keeps the system more portable than buying one monolithic platform.

## Project Role

For this project, Cube is the translation layer between enterprise systems and the Enterprise Knowledge Graph.

The Dark Factory engine asks for business context. Cube knows how to safely retrieve that context from real data sources using governed semantic models.

That makes Cube a key part of the alternative-to-Palantir strategy: we get a controlled, testable, code-first semantic layer while keeping ownership of the contracts, schemas, and orchestration logic in our own repository.
