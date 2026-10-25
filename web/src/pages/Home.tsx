import { Navigate } from 'react-router';
import { useCharacters } from '../api/queries';
import { ErrorBox, Loading } from '../components/QueryState';
import { lastCharacter } from '../lib/storage';

/** `/` opens the character read last in this browser, or the first preset. */
export function Home() {
  const characters = useCharacters();
  // Wait for a fresh list: the cached one may still contain a character that was just deleted.
  if (characters.isPending || !characters.isFetchedAfterMount) return <Loading label="正在打开…" />;
  if (characters.isError) {
    return (
      <div className="page">
        <ErrorBox error={characters.error} onRetry={() => void characters.refetch()} />
      </div>
    );
  }
  const list = characters.data.characters;
  const remembered = lastCharacter();
  const target = list.find((c) => c.id === remembered) ?? list[0];
  if (!target) return <div className="page">还没有角色。</div>;
  return <Navigate to={`/characters/${target.id}`} replace />;
}
