import { z } from 'zod';
// Answer Trace Envelope (ATE) v0.1 — the machine-canonical form of
// specs/ANSWER_TRACE_ENVELOPE_v0.1.md. Sits beside SemanticRecordSchema
// and is enforced by the same runtime validation gate.
//
// Design rules (spec section 3):
// 1. Join, never copy: ledger-owned facts (model, tokens, cost) are
//    reached via primaryRequestId; principal is the sole denormalized
//    exception, ledger authoritative on conflict.
// 2. References and hashes, never bodies.
// 3. Append-only, immutable.
// 4. query.text / retrieval.cubeQuery are policy-gated per featureTag.
export const ATE_SCHEMA_VERSION = 'ate/0.1';
const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, 'expected lowercase sha-256 hex');
export const EvidenceItemSchema = z.object({
    integrationId: z.string(),
    entityId: z.string(),
    entityName: z.string(),
    recordHash: Sha256Hex, // canonical JSON of the validated SemanticRecord
    asOf: z.string().datetime(),
    validation: z.literal('passed'), // only gate-cleared records may be evidence
    tenantId: z.string().optional(),
    retrieval: z
        .object({
        method: z.enum(['cube', 'integration', 'cache']),
        cubeQueryHash: Sha256Hex.optional(),
        cubeQuery: z.record(z.any()).optional() // policy-gated (rule 4)
    })
        .optional()
});
export const AnswerTraceSchema = z
    .object({
    traceId: z.string().uuid(),
    schemaVersion: z.literal(ATE_SCHEMA_VERSION),
    createdAt: z.string().datetime(),
    origin: z.object({
        org: z.string(), // federation slot (POC E); single-org fills "twg"
        system: z.string()
    }),
    // Denormalized from popeye attribution; mirrors spend_logs_metadata
    // vocabulary verbatim so the two systems cannot drift.
    principal: z.object({
        appId: z.string(),
        userId: z.string(),
        tenantId: z.string().optional(),
        featureTag: z.string()
    }),
    query: z.object({
        hash: Sha256Hex,
        text: z.string().optional(), // policy-gated (rule 4)
        targetIntegrationId: z.string(),
        targetEntityId: z.string().optional()
    }),
    // Empty array = answer produced with no governed evidence: a
    // queryable fact POC C treats as an automatic groundedness flag.
    evidence: z.array(EvidenceItemSchema),
    promptEnvelope: z.object({
        templateId: z.string(),
        templateVersion: z.string(),
        sections: z.array(z.object({
            name: z.string(),
            evidenceRefs: z.array(z.number().int().nonnegative()),
            tokenCount: z.number().int().nonnegative()
        })),
        totalPromptTokens: z.number().int().nonnegative()
    }),
    modelCalls: z
        .array(z.object({
        requestId: z.string(), // popeye ledger join key
        role: z.string() // "final_answer", "context_summarization", ...
    }))
        .min(1),
    primaryRequestId: z.string(),
    answer: z.object({
        hash: Sha256Hex, // POC C evaluation join; no content stored
        finishReason: z.string().optional()
    }),
    // POC B slot: designed now, populated later, no version bump needed.
    policy: z
        .object({
        securityContextHash: Sha256Hex.optional(),
        decisions: z
            .array(z.object({
            policyId: z.string(),
            effect: z.enum(['allow', 'deny'])
        }))
            .optional()
    })
        .optional(),
    // POC E slot: signature over the canonical form minus this block.
    // Canonicalization algorithm is an open decision (spec section 7)
    // and must be fixed before anything is signed.
    signature: z
        .object({
        alg: z.string(),
        keyId: z.string(),
        value: z.string()
    })
        .optional()
})
    .superRefine((t, ctx) => {
    // Structural invariants that cross fields:
    if (!t.modelCalls.some((c) => c.requestId === t.primaryRequestId)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['primaryRequestId'],
            message: 'primaryRequestId must appear in modelCalls'
        });
    }
    for (const [i, s] of t.promptEnvelope.sections.entries()) {
        for (const ref of s.evidenceRefs) {
            if (ref >= t.evidence.length) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['promptEnvelope', 'sections', i, 'evidenceRefs'],
                    message: `evidenceRef ${ref} out of range (evidence has ${t.evidence.length} items)`
                });
            }
        }
    }
});
