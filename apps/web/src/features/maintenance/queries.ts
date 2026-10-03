import { useQuery } from '@tanstack/react-query';
import type { Validated, InstallationResponse } from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { queryKeys } from '../../lib/query';
export async function readAllInstallations(
    bikeId: string,
    signal?: AbortSignal,
) {
    const items: Validated<InstallationResponse>[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
        const page = await getApi().listInstallations(
            bikeId,
            'all',
            { pageSize: 50, ...(cursor ? { cursor } : {}) },
            signal,
        );
        items.push(...page.items.map((item) => item.installation));
        if (page.nextCursor && seen.has(page.nextCursor))
            throw new Error('Incomplete installation history');
        cursor = page.nextCursor ?? undefined;
        if (cursor) seen.add(cursor);
    } while (cursor);
    return [...new Map(items.map((i) => [i.id, i])).values()];
}
export function useMaintenance(bikeId: string) {
    return useQuery({
        queryKey: queryKeys.maintenance(bikeId),
        queryFn: ({ signal }) => getApi().getBikeMaintenance(bikeId, signal),
    });
}
export function useCompleteInstallations(bikeId: string) {
    return useQuery({
        queryKey: [...queryKeys.installations(bikeId, 'all'), 'complete'],
        queryFn: ({ signal }) => readAllInstallations(bikeId, signal),
    });
}
