import { describe, expect, it } from 'vitest';
import { parseProfile } from '../../src/services/profile-validation.js';

const card = { name: '周野', background: '成都外卖骑手，地下乐队鼓手，想办一场专场。', narrativeStyle: 'novel' as const };
const field = (key: string, source = 'inferred', value = `${key} 的值`) => ({ key, value, source, reason: source === 'original' ? '' : '因为' });
const eight = ['age', 'gender', 'language', 'occupation', 'economy', 'relationship', 'residence', 'appearance'];

describe('parseProfile', () => {
  it('sorts fields into display order and always takes the name from the card', () => {
    const result = parseProfile(JSON.stringify({ fields: [...eight.reverse().map((k) => field(k)), field('name', 'imagined', '别的名字')] }), card);
    if (!result.ok) throw new Error(result.message);
    expect(result.fields[0]).toEqual({ key: 'name', value: '周野', source: 'original', reason: '' });
    expect(result.fields.map((f) => f.key)).toEqual(['name', 'age', 'gender', 'language', 'occupation', 'economy', 'relationship', 'residence', 'appearance']);
  });

  it('adds the name when missing and drops duplicate keys', () => {
    const result = parseProfile(JSON.stringify({ fields: [...eight.map((k) => field(k)), field('age', 'imagined', '重复')] }), card);
    if (!result.ok) throw new Error(result.message);
    expect(result.fields.filter((f) => f.key === 'age')).toHaveLength(1);
    expect(result.fields[0]!.key).toBe('name');
  });

  it('clips long text instead of failing', () => {
    const result = parseProfile(JSON.stringify({ fields: eight.map((k) => field(k, 'inferred', '长'.repeat(200))) }), card);
    if (!result.ok) throw new Error(result.message);
    expect(result.fields[1]!.value).toHaveLength(160);
  });

  it.each([
    ['not JSON', '好的'],
    ['too few fields', JSON.stringify({ fields: [field('age')] })],
    ['unknown key', JSON.stringify({ fields: [...eight.map((k) => field(k)), field('zodiac')] })],
    ['unknown source', JSON.stringify({ fields: eight.map((k) => field(k, 'guess')) })],
  ])('rejects %s', (_, text) => {
    expect(parseProfile(text, card).ok).toBe(false);
  });
});
