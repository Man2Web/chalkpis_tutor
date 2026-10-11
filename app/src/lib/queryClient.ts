import { QueryClient } from '@tanstack/react-query';

/**
 * The one React Query cache. A module of its own so signing out can empty it: the next person on this phone must
 * never see the last one's students or fees, even for a moment.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});
