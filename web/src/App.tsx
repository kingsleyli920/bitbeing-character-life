import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { OpenCharacter } from './pages/OpenCharacter';
import { Workspace } from './pages/Workspace';
import './styles.css';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 2_000 } },
  });
}

export function AppRoutes() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/characters/:id" element={<OpenCharacter />} />
        <Route path="/stories/:id" element={<Workspace />} />
        <Route
          path="*"
          element={
            <div className="page">
              <p>页面不存在。</p>
              <Link to="/">回到首页</Link>
            </div>
          }
        />
      </Routes>
    </>
  );
}

export function Providers({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export function App({ queryClient = createQueryClient() }: { queryClient?: QueryClient }) {
  return (
    <Providers queryClient={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  );
}
