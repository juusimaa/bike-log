import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { Uuid } from '@bikelog/api-client';
import { ApiError } from '@bikelog/api-client';
import type { AccessIssue } from '../components/SessionExpired';
export const queryKeys = {
    bikes: () => ['bikes'] as const,
    bike: (id: Uuid) => ['bike', id] as const,
    overview: (id: Uuid) => ['overview', id] as const,
    rides: (id: Uuid) => ['rides', id] as const,
    installations: (id: Uuid, status: 'current' | 'all') =>
        ['installations', id, status] as const,
    components: () => ['components'] as const,
    component: (id: Uuid) => ['component', id] as const,
    componentUsage: (id: Uuid) => ['componentUsage', id] as const,
    componentMaintenance: (id: Uuid) => ['componentMaintenance', id] as const,
    maintenance: (id: Uuid) => ['maintenance', id] as const,
    reminder: (id: Uuid) => ['reminder', id] as const,
};
function accessIssue(error: unknown): AccessIssue | null {
    if (!(error instanceof ApiError)) return null;
    if (error.status === 401) return 'expired';
    if (error.status === 403 && ['pilot_access_required', 'user_not_provisioned', 'forbidden'].includes(error.code)) return 'pilot-access';
    if (error.status === 502 || error.status === 503) return 'unavailable';
    return null;
}
export function createQueryClient(onAccessIssue?: (issue: AccessIssue) => void) {
    const report = (error: unknown) => {
        const issue = accessIssue(error);
        if (issue) onAccessIssue?.(issue);
    };
    return new QueryClient({
        queryCache: new QueryCache({ onError: report }),
        mutationCache: new MutationCache({ onError: report }),
        defaultOptions: {
            queries: { retry: (count, error) => !accessIssue(error) && count < 1, refetchOnWindowFocus: false },
            mutations: { retry: false },
        },
    });
}
export async function clearPrivateQueries(client: QueryClient): Promise<void> {
    await client.cancelQueries();
    client.clear();
}
export async function invalidateBike(
    client: QueryClient,
    bikeId: Uuid,
    componentIds: Uuid[] = [],
): Promise<void> {
    const keys = [
        queryKeys.bikes(),
        queryKeys.bike(bikeId),
        queryKeys.overview(bikeId),
        queryKeys.rides(bikeId),
        queryKeys.installations(bikeId, 'current'),
        queryKeys.installations(bikeId, 'all'),
        queryKeys.components(),
        queryKeys.maintenance(bikeId),
        queryKeys.reminder(bikeId),
        ...componentIds.flatMap((id) => [
            queryKeys.component(id),
            queryKeys.componentUsage(id),
            queryKeys.componentMaintenance(id),
        ]),
    ];
    for (const queryKey of keys) {
        await client.cancelQueries({ queryKey });
    }
    // Reset drops the entire infinite snapshot, including opaque page cursors,
    // then refetches active observers.
    await Promise.all(
        keys.map((queryKey) => client.resetQueries({ queryKey })),
    );
}
