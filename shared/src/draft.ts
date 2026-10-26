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

/** Parts of a life a chapter can be about (SPEC §2.5); the first one listed is the chapter's main thread. */
export const LIFE_AREAS = ['工作学业', '钱', '家人', '感情', '朋友', '身体', '居所日常', '兴趣爱好', '邻里社区', '旧事秘密'] as const;
export const lifeAreaSchema = z.enum(LIFE_AREAS);
export type LifeArea = z.infer<typeof lifeAreaSchema>;

/** A calendar date `YYYY-MM-DD` that exists (no 2月30日). */
export const storyDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, '日期不存在');

export const CHAPTER_BODY_MIN = 400;
export const CHAPTER_BODY_MAX = 3000;

/** What the story model must return for one chapter (SPEC §2.2). */
export const chapterDraftSchema = z.strictObject({
  title: z.string().trim().min(2).max(24),
  storyTime: z.string().trim().min(1).max(60),
  /** Story-calendar date on which the chapter starts; the server derives days elapsed and weekdays from it. */
  storyDate: storyDateSchema,
  location: z.string().trim().min(1).max(60),
  body: z.string().trim().min(CHAPTER_BODY_MIN).max(CHAPTER_BODY_MAX),
  summary: z.string().trim().min(30).max(240),
  beatTags: z.array(z.string().trim().min(1).max(12)).min(1).max(4),
  lifeAreas: z
    .array(lifeAreaSchema)
    .min(1)
    .max(3)
    .refine((a) => new Set(a).size === a.length, '生活面不能重复'),
  state: storyStateSchema,
  memoryOps: z.array(memoryOpSchema).max(12),
  traitChanges: z.array(traitChangeSchema).max(1),
  directionHandling: directionHandlingSchema.nullable(),
});
export type ChapterDraft = z.infer<typeof chapterDraftSchema>;

export const arcSummarySchema = z.strictObject({
  summary: z.string().trim().min(40).max(300),
});

/** What the consistency reviewer returns for one draft chapter (SPEC §2.7). */
export const consistencyIssueSchema = z.strictObject({
  /** Words copied from the new chapter. */
  quote: z.string().trim().min(2).max(120),
  /** Which established fact it contradicts, and where that fact comes from. */
  conflict: z.string().trim().min(2).max(200),
  chapter: z.number().int().min(1).nullable(),
  severity: z.enum(['hard', 'soft']),
});
export type ConsistencyIssue = z.infer<typeof consistencyIssueSchema>;
export const consistencyIssuesSchema = z.array(consistencyIssueSchema).max(5);
export const consistencyReportSchema = z.strictObject({
  issues: consistencyIssuesSchema,
  /** The reviewer's own reading of the chapter's main life area; the writer's label tends to be optimistic (SPEC §2.7). */
  mainArea: lifeAreaSchema,
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
export const consistencyReportWireSchema = toWireSchema(consistencyReportSchema);
