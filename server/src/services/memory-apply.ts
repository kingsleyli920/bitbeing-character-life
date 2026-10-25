import type { MemoryKind, MemoryOp, MemoryStatus } from '@cl/shared';
import type { Db } from '../db/open.js';
import { getMemory, insertMemory, updateMemory } from '../repos/memories.js';

const TRACKED: ReadonlySet<MemoryKind> = new Set(['promise', 'thread']);

function statusFor(kind: MemoryKind, requested: MemoryStatus): MemoryStatus {
  if (!TRACKED.has(kind)) return 'active';
  return requested === 'resolved' ? 'resolved' : 'open';
}

const MAX_CONTENT = 400;

/**
 * Applies a chapter's memory operations for one story (SPEC §2.2). Must run inside the commit
 * transaction. Returns warnings for operations that were dropped or adjusted (soft problems).
 */
export function applyMemoryOps(db: Db, storyId: string, chapter: number, ops: MemoryOp[], now: string): string[] {
  const warnings: string[] = [];
  for (const op of ops) {
    const existing = getMemory(db, storyId, op.key);
    if (op.op === 'resolve') {
      if (!existing) {
        warnings.push(`忽略：要解决的「${op.key}」不存在`);
        continue;
      }
      const content = `${existing.content}；结果（第${chapter}章）：${op.content}`.slice(0, MAX_CONTENT);
      updateMemory(db, storyId, op.key, {
        content,
        importance: existing.importance,
        status: TRACKED.has(existing.kind) ? 'resolved' : existing.status,
        sourceChapters: [...new Set([...existing.sourceChapters, chapter])],
        lastChapter: Math.max(existing.lastChapter, chapter),
        now,
      });
      continue;
    }
    if (!existing) {
      insertMemory(db, storyId, {
        kind: op.kind,
        key: op.key,
        content: op.content,
        importance: op.importance,
        status: statusFor(op.kind, op.status),
        chapter,
        now,
      });
      continue;
    }
    if (existing.kind !== op.kind) {
      warnings.push(`「${op.key}」原类型为 ${existing.kind}，本章写成 ${op.kind}，已保留原类型`);
    }
    updateMemory(db, storyId, op.key, {
      content: op.content,
      importance: op.importance,
      status: statusFor(existing.kind, op.status),
      sourceChapters: [...new Set([...existing.sourceChapters, chapter])],
      lastChapter: Math.max(existing.lastChapter, chapter),
      now,
    });
  }
  return warnings;
}
