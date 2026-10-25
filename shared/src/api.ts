import { z } from 'zod';

export const healthResponseSchema = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const metaResponseSchema = z.object({
  provider: z.enum(['openrouter', 'fixture']),
  model: z.string(),
  modelConfigured: z.boolean(),
});
export type MetaResponse = z.infer<typeof metaResponseSchema>;

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
