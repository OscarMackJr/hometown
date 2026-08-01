# Superseded Hometown Infrastructure Sketch

Status: Superseded, non-runnable historical material
Date: 2026-08-01

This file replaces the previous `infra/main.tf` Terraform sketch. The old file mixed hometown semantic-layer work with direct AWS/Azure database provisioning and contained hardcoded database passwords. That does not match the current hometown boundary.

Current boundary:

- hometown owns Cube models, semantic records, Answer Trace Envelope contracts, trace/eval/viewer POC code, and verification scripts.
- hometown reads divisional systems through governed integration boundaries.
- hometown does not provision production CRM, ledger, gateway, or divisional database infrastructure.
- Production infrastructure belongs in the owning system repositories and must use managed secret stores, not repository literals.

Do not run this attic note as Terraform. If infrastructure-as-code returns to this repository later, credentials must be modeled as sensitive variables or external secret references, and the design must explicitly preserve the virtualization-first boundary.
