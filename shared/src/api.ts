import { z } from 'zod';
import { characterCardSchema, narrativeStyleSchema } from './card.js';
import {
  directionHandlingSchema,
  memoryKindSchema,
  memoryStatusSchema,
  storyStateSchema,
} from './draft.js';
import './zod-locale.js';

const isoTime = z.string();

export const healthResponseSchema = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const metaResponseSchema = z.object({
  provider: z.enum(['openrouter', 'fixture']),
  model: z.string(),
  modelConfigured: z.boolean(),
  budget: z.object({ capUsd: z.number(), spentUsd: z.number() }),
});
export type MetaResponse = z.infer<typeof metaResponseSchema>;

export const issueSchema = z.object({ path: z.string(), message: z.string() });

// ---- characters -------------------------------------------------------------

export const storySummarySchema = z.object({
  id: z.string(),
  chapterCount: z.number().int(),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type StorySummary = z.infer<typeof storySummarySchema>;

export const characterSummarySchema = z.object({
  id: z.string(),
  source: z.enum(['preset', 'import']),
  name: z.string(),
  identity: z.string().nullable(),
  age: z.string().nullable(),
  narrativeStyle: narrativeStyleSchema,
  tagline: z.string(),
  latestStory: storySummarySchema.nullable(),
});
export type CharacterSummary = z.infer<typeof characterSummarySchema>;

export const characterListResponseSchema = z.object({ characters: z.array(characterSummarySchema) });

export const characterDetailSchema = z.object({
  id: z.string(),
  source: z.enum(['preset', 'import']),
  card: characterCardSchema,
  createdAt: isoTime,
  stories: z.array(storySummarySchema),
});
export type CharacterDetail = z.infer<typeof characterDetailSchema>;

export const importCharacterResponseSchema = z.object({
  character: characterSummarySchema,
  warnings: z.array(z.string()),
});
export type ImportCharacterResponse = z.infer<typeof importCharacterResponseSchema>;

export const openStoryRequestSchema = z.object({ reuseLatest: z.boolean().default(false) });
export type OpenStoryRequest = z.input<typeof openStoryRequestSchema>;

// ---- jobs -------------------------------------------------------------------

export const jobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'interrupted', 'stale']);
export type JobStatus = z.infer<typeof jobStatusSchema>;
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ['queued', 'running'];

export const errorCodeSchema = z.enum([
  'MODEL_TIMEOUT',
  'MODEL_RATE_LIMITED',
  'MODEL_UNAVAILABLE',
  'MODEL_INVALID_OUTPUT',
  'MODEL_TRUNCATED',
  'MODEL_REFUSED',
  'MODEL_AUTH',
  'MODEL_NOT_CONFIGURED',
  'BUDGET_EXCEEDED',
  'SERVER_RESTART',
  'STALE',
  'INTERNAL',
]);
export type JobErrorCode = z.infer<typeof errorCodeSchema>;

export const JOB_ERROR_MESSAGES: Record<JobErrorCode, string> = {
  MODEL_TIMEOUT: '模型响应超时',
  MODEL_RATE_LIMITED: '模型服务繁忙',
  MODEL_UNAVAILABLE: '模型服务暂不可用',
  MODEL_INVALID_OUTPUT: '生成结果格式不合格',
  MODEL_TRUNCATED: '生成内容过长被截断',
  MODEL_REFUSED: '模型拒绝了这段剧情，可以调整走向后重试',
  MODEL_AUTH: '模型密钥无效或余额不足',
  MODEL_NOT_CONFIGURED: '未配置模型密钥（见 README「配置」）',
  BUDGET_EXCEEDED: '已达到本地费用上限',
  SERVER_RESTART: '服务重启，本次生成已中断',
  STALE: '故事已被更新，本次结果已丢弃',
  INTERNAL: '内部错误',
};

export const jobUsageSchema = z.object({
  inputTokens: z.number().nullable(),
  outputTokens: z.number().nullable(),
  reasoningTokens: z.number().nullable(),
  costUsd: z.number().nullable(),
  costSource: z.enum(['reported', 'estimated', 'unknown', 'mixed']),
  latencyMs: z.number().nullable(),
});
export type JobUsage = z.infer<typeof jobUsageSchema>;

export const jobSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  requestId: z.string(),
  status: jobStatusSchema,
  targetChapter: z.number().int(),
  directionId: z.string().nullable(),
  model: z.string(),
  promptVersion: z.string(),
  attempts: z.number().int(),
  errorCode: errorCodeSchema.nullable(),
  errorMessage: z.string().nullable(),
  warnings: z.array(z.string()),
  createdAt: isoTime,
  startedAt: isoTime.nullable(),
  finishedAt: isoTime.nullable(),
  usage: jobUsageSchema,
});
export type Job = z.infer<typeof jobSchema>;

export const createJobRequestSchema = z.object({ requestId: z.uuid({ error: 'requestId 必须是 UUID' }) });
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;
export const jobResponseSchema = z.object({ job: jobSchema });
export type JobResponse = z.infer<typeof jobResponseSchema>;

// ---- stories ----------------------------------------------------------------

export const directionSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: isoTime,
  effectiveFromChapter: z.number().int(),
});
export type Direction = z.infer<typeof directionSchema>;

export const DIRECTION_MIN = 2;
export const DIRECTION_MAX = 200;
export const setDirectionRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(DIRECTION_MIN, `走向至少 ${DIRECTION_MIN} 个字`)
    .max(DIRECTION_MAX, `走向最多 ${DIRECTION_MAX} 字`),
});
export type SetDirectionRequest = z.infer<typeof setDirectionRequestSchema>;
export const directionResponseSchema = z.object({ direction: directionSchema });

export const storyDetailSchema = z.object({
  id: z.string(),
  characterId: z.string(),
  card: characterCardSchema,
  state: storyStateSchema.nullable(),
  chapterCount: z.number().int(),
  version: z.number().int(),
  direction: directionSchema.nullable(),
  activeJob: jobSchema.nullable(),
  lastJob: jobSchema.nullable(),
  otherStories: z.array(storySummarySchema),
  createdAt: isoTime,
  updatedAt: isoTime,
});
export type StoryDetail = z.infer<typeof storyDetailSchema>;

export const chapterSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  storyTime: z.string(),
  location: z.string(),
  body: z.string(),
  summary: z.string(),
  beatTags: z.array(z.string()),
  direction: z.object({ id: z.string(), text: z.string() }).nullable(),
  directionHandling: directionHandlingSchema.nullable(),
  jobId: z.string(),
  createdAt: isoTime,
});
export type Chapter = z.infer<typeof chapterSchema>;

export const CHAPTER_PAGE_MAX = 20;
export const chaptersQuerySchema = z.object({
  from: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(CHAPTER_PAGE_MAX).default(10),
});
export const chaptersResponseSchema = z.object({ chapters: z.array(chapterSchema), total: z.number().int() });
export type ChaptersResponse = z.infer<typeof chaptersResponseSchema>;

export const tocResponseSchema = z.object({
  items: z.array(z.object({ number: z.number().int(), title: z.string(), storyTime: z.string() })),
});
export type TocResponse = z.infer<typeof tocResponseSchema>;

export const memoryItemSchema = z.object({
  id: z.string(),
  kind: memoryKindSchema,
  key: z.string(),
  content: z.string(),
  importance: z.number().int(),
  status: memoryStatusSchema,
  sourceChapters: z.array(z.number().int()),
  firstChapter: z.number().int(),
  lastChapter: z.number().int(),
});
export type MemoryItem = z.infer<typeof memoryItemSchema>;

export const memoryResponseSchema = z.object({
  items: z.array(memoryItemSchema),
  traitChanges: z.array(
    z.object({
      chapterNumber: z.number().int(),
      trait: z.string(),
      from: z.string(),
      to: z.string(),
      causeChapters: z.array(z.number().int()),
      explanation: z.string(),
    }),
  ),
  arcSummaries: z.array(z.object({ fromChapter: z.number().int(), toChapter: z.number().int(), summary: z.string() })),
});
export type MemoryResponse = z.infer<typeof memoryResponseSchema>;

// ---- errors -----------------------------------------------------------------

export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  issues: z.array(issueSchema).optional(),
  job: jobSchema.optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
