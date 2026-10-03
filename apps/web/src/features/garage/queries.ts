import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Uuid } from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { queryKeys } from '../../lib/query';
export function useBikes() {
    return useInfiniteQuery({
        queryKey: queryKeys.bikes(),
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            getApi().listBikes({ pageSize: 50, cursor: pageParam }, signal),
        getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
}
export function useBike(id: Uuid | null) {
    return useQuery({
        queryKey: queryKeys.bike(id ?? ''),
        enabled: !!id,
        queryFn: ({ signal }) => getApi().getBike(id!, signal),
    });
}
export function useOverview(id: Uuid) {
    return useQuery({
        queryKey: queryKeys.overview(id),
        queryFn: ({ signal }) => getApi().getOverview(id, signal),
    });
}
export function useCurrentInstallations(id: Uuid) {
    return useInfiniteQuery({
        queryKey: queryKeys.installations(id, 'current'),
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            getApi().listInstallations(
                id,
                'current',
                { pageSize: 50, cursor: pageParam },
                signal,
            ),
        getNextPageParam: (last) => last.nextCursor ?? undefined,
    });
}
