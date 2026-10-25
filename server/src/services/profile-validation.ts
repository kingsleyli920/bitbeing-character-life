import { type CharacterCard, type ProfileField, profileDraftSchema, PROFILE_FIELDS } from '@cl/shared';

export type ProfileResult = { ok: true; fields: ProfileField[] } | { ok: false; message: string };

const ORDER = new Map<string, number>(PROFILE_FIELDS.map((f, i) => [f.key, i]));

/**
 * Validates a profile completion. Keeps the first entry per key, sorts by display order, clips
 * over-long text, and always takes the name from the card itself.
 */
export function parseProfile(text: string, card: CharacterCard): ProfileResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { ok: false, message: '输出不是合法的 JSON' };
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { fields?: unknown }).fields)) {
    (raw as { fields: unknown[] }).fields = (raw as { fields: unknown[] }).fields.map((f) => {
      if (!f || typeof f !== 'object') return f;
      const field = { ...(f as Record<string, unknown>) };
      for (const [key, max] of [['value', 160], ['reason', 100]] as const) {
        if (typeof field[key] === 'string' && [...(field[key] as string)].length > max) field[key] = [...(field[key] as string)].slice(0, max).join('');
      }
      return field;
    });
  }
  const parsed = profileDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: `输出不符合约定：${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
  }
  const seen = new Set<string>();
  const fields = parsed.data.fields
    .filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)))
    .map((f) => (f.key === 'name' ? { key: 'name' as const, value: card.name, source: 'original' as const, reason: '' } : f))
    .sort((a, b) => ORDER.get(a.key)! - ORDER.get(b.key)!);
  if (!seen.has('name')) fields.unshift({ key: 'name', value: card.name, source: 'original', reason: '' });
  return { ok: true, fields };
}
