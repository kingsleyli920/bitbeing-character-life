import { type CharacterSummary, NARRATIVE_STYLE_LABELS } from '@cl/shared';
import { Link } from 'react-router';
import { useCharacters } from '../api/queries';
import { Empty, ErrorBox, Loading } from '../components/QueryState';

function CharacterCard({ c }: { c: CharacterSummary }) {
  const progress = c.latestStory && c.latestStory.chapterCount > 0 ? `读到第 ${c.latestStory.chapterCount} 章` : '还没有开始';
  return (
    <li>
      <Link className="book" to={`/characters/${c.id}`} aria-label={`${c.name}，${progress}`}>
        <span className="book-style">{NARRATIVE_STYLE_LABELS[c.narrativeStyle]}</span>
        <span className="book-name">{c.name}</span>
        <span className="book-meta">{[c.age, c.identity].filter(Boolean).join(' · ')}</span>
        <span className="book-tagline">{c.tagline}</span>
        <span className="book-progress">{progress}</span>
      </Link>
    </li>
  );
}

export function Bookshelf({ onImport }: { onImport?: () => void }) {
  const characters = useCharacters();
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
              {onImport && (
                <button type="button" className="btn btn-primary" onClick={onImport}>
                  导入角色
                </button>
              )}
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
    </div>
  );
}
