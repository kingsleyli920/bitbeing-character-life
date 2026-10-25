import { z } from 'zod';
import './zod-locale.js';

export const narrativeStyleSchema = z.enum(['novel', 'diary', 'social']);
export type NarrativeStyle = z.infer<typeof narrativeStyleSchema>;

export const NARRATIVE_STYLE_LABELS: Record<NarrativeStyle, string> = {
  novel: '小说',
  diary: '日记',
  social: '小说 + 社交动态',
};

const text = (max: number, label: string) =>
  z.string({ error: `${label}必须是文字` }).trim().max(max, `${label}最多 ${max} 字`);

/** A required string whose "missing" and "wrong type" errors name the field. */
const requiredText = (label: string, min: number, max: number) =>
  z
    .string({ error: (issue) => (issue.input === undefined ? `请填写${label}` : `${label}必须是文字`) })
    .trim()
    .min(min, min === 1 ? `请填写${label}` : `${label}至少 ${min} 字`)
    .max(max, `${label}最多 ${max} 字`);

const relationshipSchema = z.strictObject({
  name: requiredText('人物姓名', 1, 20),
  relation: requiredText('关系', 1, 30),
  note: text(200, '备注').optional(),
});

export const characterCardSchema = z.strictObject({
  name: requiredText('姓名', 1, 20),
  background: requiredText('背景', 20, 2000),
  personality: text(800, '性格').optional(),
  values: z.array(text(60, '价值观').min(1, '价值观不能为空')).max(6, '价值观最多 6 条').optional(),
  speechStyle: text(300, '表达方式').optional(),
  age: text(30, '年龄').optional(),
  gender: text(30, '性别').optional(),
  identity: text(30, '身份').optional(),
  world: text(300, '世界设定').optional(),
  relationships: z.array(relationshipSchema).max(10, '人际关系最多 10 条').optional(),
  goals: z.array(text(100, '目标').min(1, '目标不能为空')).max(5, '目标最多 5 条').optional(),
  narrativeStyle: narrativeStyleSchema.default('novel'),
  openingHint: text(500, '开场情境').optional(),
});
export type CharacterCard = z.infer<typeof characterCardSchema>;

const jsonCardSchema = characterCardSchema.extend({
  personality: requiredText('性格', 1, 800),
});

export const importCharacterRequestSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('text'), name: z.string(), description: z.string() }),
  z.object({ format: z.literal('json'), content: z.string() }),
  z.object({ format: z.literal('tavern'), content: z.string() }),
]);
export type ImportCharacterRequest = z.infer<typeof importCharacterRequestSchema>;

export interface ImportIssue {
  path: string;
  message: string;
}

export type CardImportResult =
  | { ok: true; card: CharacterCard; warnings: string[] }
  | { ok: false; issues: ImportIssue[] };

export function issuesFromZod(error: z.ZodError): ImportIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function fail(path: string, message: string): CardImportResult {
  return { ok: false, issues: [{ path, message }] };
}

type JsonObjectResult = { ok: true; value: Record<string, unknown> } | { ok: false; issue: ImportIssue };

function parseJsonObject(content: string): JsonObjectResult {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (err) {
    return { ok: false, issue: { path: '', message: `不是合法的 JSON：${(err as Error).message}` } };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, issue: { path: '', message: '内容必须是一个 JSON 对象（以 { 开头）' } };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

const TAVERN_IGNORED = [
  'mes_example',
  'system_prompt',
  'post_history_instructions',
  'alternate_greetings',
  'character_book',
] as const;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function hasContent(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === 'object' && value !== null;
}

/** Maps a SillyTavern card (V1 flat, or V2/V3 with `data`) onto a CharacterCard. */
function parseTavern(content: string): CardImportResult {
  const obj = parseJsonObject(content);
  if (!obj.ok) return { ok: false, issues: [obj.issue] };
  const root = obj.value;
  const isV2 = root.spec === 'chara_card_v2' || root.spec === 'chara_card_v3';
  const data = (isV2 ? root.data : root) as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object' || !('name' in data) || !('description' in data)) {
    return fail('', '不是酒馆角色卡结构：需要 spec 为 chara_card_v2/v3 的 data 字段，或 V1 平铺的 name 与 description');
  }

  const name = str(data.name).trim();
  const sub = (s: string) =>
    s
      .replaceAll(/\{\{char\}\}|<BOT>/gi, name || '角色')
      .replaceAll(/\{\{user\}\}|<USER>/gi, '一位朋友')
      .trim();

  const warnings: string[] = [];
  const clip = (field: string, value: string, max: number) => {
    if (value.length <= max) return value;
    warnings.push(`${field} 超过 ${max} 字，已截断`);
    return value.slice(0, max);
  };

  const issues: ImportIssue[] = [];
  if (!name) issues.push({ path: 'name', message: '酒馆卡的 name 为空' });
  const description = sub(str(data.description));
  if (!description) issues.push({ path: 'description', message: '酒馆卡的 description 为空' });
  if (issues.length) return { ok: false, issues };

  const ignored = TAVERN_IGNORED.filter((key) => hasContent(data[key]));
  if (ignored.length) warnings.push(`已忽略以下字段（不用于故事生成）：${ignored.join('、')}`);

  const personality = sub(str(data.personality));
  const world = sub(str(data.scenario));
  const opening = sub(str(data.first_mes));
  const candidate = {
    name: name.slice(0, 20),
    background: clip('description', description, 2000),
    ...(personality && { personality: clip('personality', personality, 800) }),
    ...(world && { world: clip('scenario', world, 300) }),
    ...(opening && { openingHint: clip('first_mes', opening, 500) }),
  };
  const parsed = characterCardSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      issues: issuesFromZod(parsed.error).map((i) => (i.path === 'background' ? { ...i, path: 'description' } : i)),
    };
  }
  return { ok: true, card: parsed.data, warnings };
}

/** Validates and normalises the three import formats (SPEC §1.3). Shared by the import form and the server. */
export function parseCardImport(req: ImportCharacterRequest): CardImportResult {
  switch (req.format) {
    case 'text': {
      const issues: ImportIssue[] = [];
      const name = req.name.trim();
      const description = req.description.trim();
      if (!name) issues.push({ path: 'name', message: '请填写姓名' });
      else if (name.length > 20) issues.push({ path: 'name', message: '姓名最多 20 字' });
      if (description.length < 20) issues.push({ path: 'description', message: '描述至少 20 字' });
      else if (description.length > 2000) issues.push({ path: 'description', message: '描述最多 2000 字' });
      if (issues.length) return { ok: false, issues };
      return { ok: true, card: { name, background: description, narrativeStyle: 'novel' }, warnings: [] };
    }
    case 'json': {
      const obj = parseJsonObject(req.content);
      if (!obj.ok) return { ok: false, issues: [obj.issue] };
      const parsed = jsonCardSchema.safeParse(obj.value);
      if (!parsed.success) return { ok: false, issues: issuesFromZod(parsed.error) };
      return { ok: true, card: parsed.data, warnings: [] };
    }
    case 'tavern':
      return parseTavern(req.content);
  }
}

