import type { MemoryItem, MemoryResponse } from '@cl/shared';
import { useMemory } from '../api/queries';
import { ErrorBox, Loading } from './QueryState';

function Sources({ numbers, onJump }: { numbers: number[]; onJump: (n: number) => void }) {
  return (
    <span className="sources">
      {numbers.map((n) => (
        <button key={n} type="button" className="source-link" onClick={() => onJump(n)} aria-label={`跳到第 ${n} 段`}>
          第{n}段
        </button>
      ))}
    </span>
  );
}

function Group({ title, items, onJump, open = false }: { title: string; items: MemoryItem[]; onJump: (n: number) => void; open?: boolean }) {
  if (items.length === 0) return null;
  return (
    <details className="memory-group" open={open}>
      <summary>
        {title} <span className="count">{items.length}</span>
      </summary>
      <ul className="memory-list">
        {items.map((m) => (
          <li key={m.id} className={`memory-item importance-${m.importance}`}>
            <p className="memory-key">{m.key}</p>
            <p className="memory-content">{m.content}</p>
            <Sources numbers={m.sourceChapters} onJump={onJump} />
          </li>
        ))}
      </ul>
    </details>
  );
}

export function groupMemory(data: MemoryResponse) {
  const open = data.items.filter((m) => m.status === 'open');
  return {
    open,
    people: data.items.filter((m) => m.kind === 'person' && m.status !== 'resolved'),
    events: data.items.filter((m) => (m.kind === 'event' || m.kind === 'trait') && m.status !== 'resolved'),
    resolved: data.items.filter((m) => m.status === 'resolved'),
  };
}

export function MemoryPanel({ storyId, version, onJump }: { storyId: string; version: number; onJump: (n: number) => void }) {
  const memory = useMemory(storyId, version);
  const total = memory.data?.items.length ?? 0;
  return (
    <section className="panel memory-panel">
      <details className="fold">
        <summary>
          记忆 <span className="count">{total}</span>
        </summary>
        <p className="muted small">每写一段都会更新这些记录；点「第 N 段」可以回到原文。</p>
        {memory.isPending && <Loading />}
        {memory.isError && <ErrorBox error={memory.error} onRetry={() => void memory.refetch()} />}
        {memory.data && total === 0 && memory.data.traitChanges.length === 0 && <p className="muted small">还没有记忆，写完第一段后出现。</p>}
        {memory.data && (
          <>
            <Group title="未解决的承诺与线索" items={groupMemory(memory.data).open} onJump={onJump} open />
            <Group title="人物" items={groupMemory(memory.data).people} onJump={onJump} />
            <Group title="重要事件与特征" items={groupMemory(memory.data).events} onJump={onJump} />
            <Group title="已解决" items={groupMemory(memory.data).resolved} onJump={onJump} />
            {memory.data.traitChanges.length > 0 && (
              <details className="memory-group">
                <summary>
                  性格变化 <span className="count">{memory.data.traitChanges.length}</span>
                </summary>
                <ul className="memory-list">
                  {memory.data.traitChanges.map((t, i) => (
                    <li key={i} className="memory-item">
                      <p className="memory-key">
                        第{t.chapterNumber}段 · {t.trait}：{t.from} → {t.to}
                      </p>
                      <p className="memory-content">{t.explanation}</p>
                      <Sources numbers={t.causeChapters} onJump={onJump} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {memory.data.arcSummaries.length > 0 && (
              <details className="memory-group">
                <summary>
                  卷摘要 <span className="count">{memory.data.arcSummaries.length}</span>
                </summary>
                <ul className="memory-list">
                  {memory.data.arcSummaries.map((a) => (
                    <li key={a.fromChapter} className="memory-item">
                      <p className="memory-key">
                        第{a.fromChapter}–{a.toChapter}段
                      </p>
                      <p className="memory-content">{a.summary}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </details>
    </section>
  );
}
