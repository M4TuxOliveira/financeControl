import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ApiError } from './api/client';
import { AuthProvider } from './auth/AuthProvider';
import { pickBackend } from './auth/cognito';
import { Root } from './Root';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => count < 1 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider backend={pickBackend()}>
      <Root />
    </AuthProvider>
  </QueryClientProvider>,
);
