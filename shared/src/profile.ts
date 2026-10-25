import { z } from 'zod';
import { toWireSchema } from './draft.js';
import './zod-locale.js';

/** Card fields the model completes, in display order (matches the reference layout). */
export const PROFILE_FIELDS = [
  { key: 'name', label: '名字' },
  { key: 'age', label: '年龄' },
  { key: 'gender', label: '性别' },
  { key: 'language', label: '国籍与语言背景' },
  { key: 'occupation', label: '职业与身份' },
  { key: 'economy', label: '经济状态' },
  { key: 'relationship', label: '感情状态' },
  { key: 'residence', label: '居住环境' },
  { key: 'appearance', label: '穿衣风格' },
  { key: 'signature', label: '标志性特征' },
  { key: 'routine', label: '日常作息' },
  { key: 'hobbies', label: '兴趣爱好' },
  { key: 'speech', label: '说话习惯' },
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]['key'];
export const profileFieldKeySchema = z.enum(PROFILE_FIELDS.map((f) => f.key) as [ProfileFieldKey, ...ProfileFieldKey[]]);

/** original: stated in the card; inferred: reasoned from the card; imagined: invented, consistent with the card. */
export const profileSourceSchema = z.enum(['original', 'inferred', 'imagined']);
export type ProfileSource = z.infer<typeof profileSourceSchema>;
export const PROFILE_SOURCE_LABELS: Record<ProfileSource, string> = { original: '原文', inferred: '推理', imagined: '想象' };

export const profileFieldSchema = z.strictObject({
  key: profileFieldKeySchema,
  value: z.string().trim().min(1).max(160),
  source: profileSourceSchema,
  reason: z.string().trim().max(100),
});
export type ProfileField = z.infer<typeof profileFieldSchema>;

/** What the model returns for a profile completion. */
export const profileDraftSchema = z.strictObject({
  fields: z.array(profileFieldSchema).min(8).max(PROFILE_FIELDS.length),
});
export const profileDraftWireSchema = toWireSchema(profileDraftSchema);

export const characterProfileSchema = z.object({
  fields: z.array(profileFieldSchema),
  model: z.string(),
  createdAt: z.string(),
});
export type CharacterProfile = z.infer<typeof characterProfileSchema>;

export const profileStatusSchema = z.enum(['none', 'pending', 'ready', 'failed']);
export type ProfileStatus = z.infer<typeof profileStatusSchema>;

export const profileStateSchema = z.object({
  status: profileStatusSchema,
  profile: characterProfileSchema.nullable(),
  error: z.string().nullable(),
});
export type ProfileState = z.infer<typeof profileStateSchema>;

export const profileLabel = (key: ProfileFieldKey): string => PROFILE_FIELDS.find((f) => f.key === key)!.label;
