import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { api } from './api/client';
import './styles.css';

function Header() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.getMeta });
  return (
    <header className="site-header">
      <a className="brand" href="/">
        角色人生
      </a>
      {meta.data?.provider === 'fixture' && (
        <span className="badge" title="使用确定性假模型，内容不是 AI 生成">
          Fixture 模式
        </span>
      )}
    </header>
  );
}

export function App({ queryClient = new QueryClient() }: { queryClient?: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Header />
      <main className="page">
        <p className="muted">书架正在搭建中。</p>
      </main>
    </QueryClientProvider>
  );
}
