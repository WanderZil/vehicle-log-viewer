import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

const defaultQueryOptions: DefaultOptions = {
  queries: {
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  },
};

export function createAppQueryClient() {
  return new QueryClient({ defaultOptions: defaultQueryOptions });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    return createAppQueryClient();
  }
  browserQueryClient ??= createAppQueryClient();
  return browserQueryClient;
}
