import { z } from 'zod';
// Strict runtime typing interface ensuring Agent compliance across divisions
export const SemanticRecordSchema = z.object({
    entityId: z.string(),
    entityName: z.string(),
    attributes: z.record(z.any()),
    relationships: z.array(z.object({
        relation: z.string(),
        targetEntity: z.string(),
        sourceNode: z.string(),
        metadata: z.record(z.any()).optional()
    }))
});
