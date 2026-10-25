import { Link } from 'react-router';
import { useCharacters } from '../api/queries';

/** One chip per character; the active one is highlighted. */
export function CharacterSwitcher({ activeId }: { activeId: string }) {
  const characters = useCharacters();
  if (!characters.data) return null;
  return (
    <nav className="switcher" aria-label="切换角色">
      {characters.data.characters.map((c) => {
        const progress = c.latestStory && c.latestStory.chapterCount > 0 ? `读到第 ${c.latestStory.chapterCount} 段` : '还没有开始';
        return (
          <Link
            key={c.id}
            to={`/characters/${c.id}`}
            className={`switch-chip ${c.id === activeId ? 'switch-chip-active' : ''}`}
            aria-current={c.id === activeId ? 'true' : undefined}
            title={`${c.name} · ${progress}`}
            aria-label={`${c.name}，${progress}`}
          >
            {c.name}
            {c.source === 'import' && <span className="switch-tag">导入</span>}
          </Link>
        );
      })}
    </nav>
  );
}
