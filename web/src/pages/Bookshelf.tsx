import { type CharacterSummary, NARRATIVE_STYLE_LABELS } from '@cl/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import { useCharacters } from '../api/queries';
import { ImportDialog } from '../components/ImportDialog';
import { Empty, ErrorBox, errorText, Loading } from '../components/QueryState';

function DeleteControl({ c }: { c: CharacterSummary }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteCharacter(c.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['characters'] }),
  });
  if (!confirming) {
    return (
      <button type="button" className="book-delete" onClick={() => setConfirming(true)} aria-label={`删除${c.name}`}>
        删除
      </button>
    );
  }
  return (
    <div className="book-confirm" role="group" aria-label={`确认删除${c.name}`}>
      <span>删除角色和 TA 的所有故事？</span>
      <button type="button" className="btn btn-danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
        确认删除
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
        取消
      </button>
      {remove.isError && <span className="field-error">{errorText(remove.error)}</span>}
    </div>
  );
}

function CharacterCard({ c }: { c: CharacterSummary }) {
  const progress = c.latestStory && c.latestStory.chapterCount > 0 ? `读到第 ${c.latestStory.chapterCount} 章` : '还没有开始';
  return (
    <li className="book-item">
      <Link className="book" to={`/characters/${c.id}`} aria-label={`${c.name}，${progress}`}>
        <span className="book-style">{NARRATIVE_STYLE_LABELS[c.narrativeStyle]}</span>
        <span className="book-name">{c.name}</span>
        <span className="book-meta">{[c.age, c.identity].filter(Boolean).join(' · ')}</span>
        <span className="book-tagline">{c.tagline}</span>
        <span className="book-progress">{progress}</span>
      </Link>
      {c.source === 'import' && <DeleteControl c={c} />}
    </li>
  );
}

export function Bookshelf() {
  const characters = useCharacters();
  const [importing, setImporting] = useState(false);
  const presets = characters.data?.characters.filter((c) => c.source === 'preset') ?? [];
  const imported = characters.data?.characters.filter((c) => c.source === 'import') ?? [];

  return (
    <div className="page bookshelf">
      <section className="shelf-intro">
        <h1>选一个人，读 TA 的生活</h1>
        <p>每一章都是这个人生活里的一段。你可以随时给出「故事走向」，从下一章开始影响 TA 的经历。</p>
      </section>

      {characters.isPending && <Loading label="正在取书…" />}
      {characters.isError && <ErrorBox error={characters.error} onRetry={() => void characters.refetch()} />}

      {characters.data && (
        <>
          <section aria-labelledby="preset-heading">
            <h2 id="preset-heading" className="shelf-heading">
              书架
            </h2>
            <ul className="shelf">
              {presets.map((c) => (
                <CharacterCard key={c.id} c={c} />
              ))}
            </ul>
          </section>
          <section aria-labelledby="import-heading">
            <div className="shelf-heading-row">
              <h2 id="import-heading" className="shelf-heading">
                我导入的角色
              </h2>
              <button type="button" className="btn btn-primary" onClick={() => setImporting(true)}>
                导入角色
              </button>
            </div>
            {imported.length === 0 ? (
              <Empty title="还没有导入角色">
                <p className="muted">支持粘贴一段描述、自定义 JSON 或酒馆角色卡 JSON。</p>
              </Empty>
            ) : (
              <ul className="shelf">
                {imported.map((c) => (
                  <CharacterCard key={c.id} c={c} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}
