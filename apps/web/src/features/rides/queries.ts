import { useInfiniteQuery } from '@tanstack/react-query';
import { getApi } from '../../lib/api';
import { queryKeys } from '../../lib/query';
export function useRidePages(bikeId: string) {
    return useInfiniteQuery({
        queryKey: queryKeys.rides(bikeId),
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            getApi().listRides(
                bikeId,
                { pageSize: 50, cursor: pageParam },
                signal,
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
    });
}
