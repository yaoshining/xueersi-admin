import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router';
const HomeworkPage = lazy(() =>
  import('./features/homework/page').then((module) => ({
    default: module.HomeworkPage,
  })),
);
import { Skeleton } from './components/ui/skeleton';
import './index.css';
import { ThemeProvider } from './components/workbench/theme-provider';
import { applyTheme, readTheme } from './lib/theme';
applyTheme(readTheme());
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
  },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <BrowserRouter>
          <Suspense
            fallback={
              <main className="p-8" aria-label="正在加载工作台">
                <Skeleton className="h-20 w-full" />
              </main>
            }
          >
            <Routes>
              <Route path="*" element={<HomeworkPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
