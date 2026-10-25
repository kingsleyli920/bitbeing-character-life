import { z } from 'zod';
import './zod-locale.js';

export const memoryKindSchema = z.enum(['person', 'event', 'promise', 'thread', 'trait']);
export type MemoryKind = z.infer<typeof memoryKindSchema>;
export const memoryStatusSchema = z.enum(['active', 'open', 'resolved']);
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

export const storyStateSchema = z.strictObject({
  time: z.string().trim().min(1).max(60),
  location: z.string().trim().min(1).max(60),
  situation: z.string().trim().min(1).max(200),
  goals: z.array(z.string().trim().min(1).max(80)).min(1).max(4),
  mood: z.string().trim().min(1).max(40),
});
export type StoryState = z.infer<typeof storyStateSchema>;

export const memoryOpSchema = z.strictObject({
  op: z.enum(['upsert', 'resolve']),
  kind: memoryKindSchema,
  key: z.string().trim().min(1).max(40),
  content: z.string().trim().min(1).max(300),
  importance: z.number().int().min(1).max(3),
  status: memoryStatusSchema,
});
export type MemoryOp = z.infer<typeof memoryOpSchema>;

export const traitChangeSchema = z.strictObject({
  trait: z.string().trim().min(1).max(30),
  from: z.string().trim().min(1).max(80),
  to: z.string().trim().min(1).max(80),
  causeChapters: z.array(z.number().int().min(1)).min(1).max(5),
  explanation: z.string().trim().min(1).max(200),
});
export type TraitChange = z.infer<typeof traitChangeSchema>;

export const directionHandlingSchema = z.strictObject({
  applied: z.boolean(),
  how: z.string().trim().min(1).max(300),
  adjustments: z.string().trim().max(300).nullable(),
});
export type DirectionHandling = z.infer<typeof directionHandlingSchema>;

export const CHAPTER_BODY_MIN = 400;
export const CHAPTER_BODY_MAX = 3000;

/** What the story model must return for one chapter (SPEC §2.2). */
export const chapterDraftSchema = z.strictObject({
  title: z.string().trim().min(2).max(24),
  storyTime: z.string().trim().min(1).max(60),
  /** Days between the end of the previous chapter and the start of this one (0 = same day). */
  daysSincePrevious: z.number().int().min(0).max(3650),
  location: z.string().trim().min(1).max(60),
  body: z.string().trim().min(CHAPTER_BODY_MIN).max(CHAPTER_BODY_MAX),
  summary: z.string().trim().min(30).max(240),
  beatTags: z.array(z.string().trim().min(1).max(12)).min(1).max(4),
  state: storyStateSchema,
  memoryOps: z.array(memoryOpSchema).max(12),
  traitChanges: z.array(traitChangeSchema).max(1),
  directionHandling: directionHandlingSchema.nullable(),
});
export type ChapterDraft = z.infer<typeof chapterDraftSchema>;

export const arcSummarySchema = z.strictObject({
  summary: z.string().trim().min(40).max(300),
});

const DROPPED_KEYWORDS = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'pattern',
  'format',
]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED_KEYWORDS.has(key)) continue;
    out[key] = key === 'properties' ? Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, strip(v)])) : strip(value);
  }
  return out;
}

/**
 * JSON Schema for `response_format` (strict). Length/range keywords are removed because some
 * providers reject them; the full zod schema re-validates every response on the server.
 */
export function toWireSchema(schema: z.ZodType): Record<string, unknown> {
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>;
}

export const chapterDraftWireSchema = toWireSchema(chapterDraftSchema);
export const arcSummaryWireSchema = toWireSchema(arcSummarySchema);
