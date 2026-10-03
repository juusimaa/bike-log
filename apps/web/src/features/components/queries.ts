import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getApi } from '../../lib/api';
import { queryKeys } from '../../lib/query';
export function useInstallationPages(
    bikeId: string,
    status: 'current' | 'all',
) {
    return useInfiniteQuery({
        queryKey: queryKeys.installations(bikeId, status),
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            getApi().listInstallations(
                bikeId,
                status,
                { pageSize: 50, cursor: pageParam },
                signal,
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
    });
}
export function useComponentPages() {
    return useInfiniteQuery({
        queryKey: queryKeys.components(),
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            getApi().listComponents(
                { pageSize: 50, cursor: pageParam },
                signal,
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
    });
}
export function usePassport(componentId: string) {
    const detail = useQuery({
        queryKey: queryKeys.component(componentId),
        queryFn: ({ signal }) => getApi().getComponent(componentId, signal),
    });
    const usage = useQuery({
        queryKey: queryKeys.componentUsage(componentId),
        queryFn: ({ signal }) =>
            getApi().getComponentUsage(componentId, signal),
    });
    const maintenance = useInfiniteQuery({
        queryKey: queryKeys.componentMaintenance(componentId),
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            getApi().listComponentMaintenance(
                componentId,
                { pageSize: 50, cursor: pageParam },
                signal,
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
    });
    return { detail, usage, maintenance };
}
