import { describe, expect, it } from 'vitest';
import { chapterDraftSchema, chapterDraftWireSchema, arcSummaryWireSchema, toWireSchema } from './draft.js';
import { z } from 'zod';

const validDraft = {
  title: '雨夜的鼓点',
  storyTime: '十月第二个周三，夜',
  location: '成都，春熙路后巷',
  body: '雨'.repeat(900),
  summary: '周野因超时被扣奖励，又被场地老板限期报出主唱名字，否则专场取消。他找不到人选，定金还是骗父亲凑的。',
  beatTags: ['送单受挫', '乐队危机'],
  state: {
    time: '十月第二个周三深夜',
    location: '成都',
    situation: '主唱退出，专场面临取消',
    goals: ['明天中午前找到主唱'],
    mood: '焦躁但不服输',
  },
  memoryOps: [
    { op: 'upsert', kind: 'person', key: '老曾', content: 'livehouse 老板', importance: 2, status: 'active' },
    { op: 'upsert', kind: 'promise', key: '报主唱名字', content: '答应明天中午前报名字', importance: 3, status: 'open' },
  ],
  traitChanges: [],
  directionHandling: { applied: true, how: '让他被场地老板限期，专场面临取消', adjustments: null },
};

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node && typeof node === 'object') {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((n) => walk(n, visit));
  }
}

describe('chapterDraftSchema', () => {
  it('accepts a complete draft', () => {
    expect(chapterDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it('accepts a null directionHandling when no direction is active', () => {
    expect(chapterDraftSchema.safeParse({ ...validDraft, directionHandling: null }).success).toBe(true);
  });

  it.each([
    ['body too short', { body: '短'.repeat(399) }],
    ['body too long', { body: '长'.repeat(3001) }],
    ['no beat tags', { beatTags: [] }],
    ['too many trait changes', { traitChanges: [1, 2].map(() => ({ trait: '胆量', from: '怯', to: '敢', causeChapters: [1], explanation: '因为' })) }],
    ['memory key too long', { memoryOps: [{ ...validDraft.memoryOps[0], key: '键'.repeat(41) }] }],
    ['unknown memory kind', { memoryOps: [{ ...validDraft.memoryOps[0], kind: 'place' }] }],
    ['extra field', { mood: 'x' }],
  ])('rejects %s', (_, patch) => {
    expect(chapterDraftSchema.safeParse({ ...validDraft, ...patch }).success).toBe(false);
  });
});

describe('wire schema sent to the model', () => {
  it.each([
    ['chapter', chapterDraftWireSchema],
    ['arc summary', arcSummaryWireSchema],
  ])('%s: every object is closed and lists all properties as required', (_, schema) => {
    let objects = 0;
    walk(schema, (node) => {
      if (node.type === 'object') {
        objects++;
        expect(node.additionalProperties).toBe(false);
        expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties as object).sort());
      }
    });
    expect(objects).toBeGreaterThan(0);
  });

  it('drops length and range keywords that some providers reject', () => {
    const banned = ['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', '$schema', 'pattern', 'format'];
    walk(chapterDraftWireSchema, (node) => {
      for (const key of banned) expect(node).not.toHaveProperty(key);
    });
  });

  it('keeps enums and nullable types', () => {
    const wire = toWireSchema(z.strictObject({ k: z.enum(['a', 'b']), n: z.string().min(2).nullable() }));
    expect(wire).toEqual({
      type: 'object',
      properties: { k: { type: 'string', enum: ['a', 'b'] }, n: { anyOf: [{ type: 'string' }, { type: 'null' }] } },
      required: ['k', 'n'],
      additionalProperties: false,
    });
  });
});
