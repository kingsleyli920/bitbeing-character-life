import { useToc } from '../api/queries';
import { Modal } from './Modal';
import { ErrorBox, Loading } from './QueryState';

export function TocDrawer({ storyId, total, onJump, onClose }: { storyId: string; total: number; onJump: (n: number) => void; onClose: () => void }) {
  const toc = useToc(storyId, total, true);
  return (
    <Modal title={`目录 · 共 ${total} 段`} onClose={onClose}>
      {toc.isPending && <Loading />}
      {toc.isError && <ErrorBox error={toc.error} onRetry={() => void toc.refetch()} />}
      {toc.data && (
        <ol className="toc">
          {toc.data.items.map((item) => (
            <li key={item.number}>
              <button type="button" className="toc-item" onClick={() => onJump(item.number)}>
                <span className="toc-no">第 {item.number} 段</span>
                <span className="toc-title">{item.title}</span>
                <span className="toc-time">{item.storyTime}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
