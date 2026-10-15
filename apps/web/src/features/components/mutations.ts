import { useQueryClient } from '@tanstack/react-query';
import type {
    ComponentEstimateResponse,
    EditComponentEstimate,
    Validated,
} from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { invalidateBike, invalidateBikes, queryKeys } from '../../lib/query';
import { useMutationRecovery } from '../../lib/mutation';
export type EstimateSave = {
    componentId: string;
    input: EditComponentEstimate;
    affectedBikeIds: string[];
};
export function useSaveEstimate() {
    const client = useQueryClient();
    return useMutationRecovery<
        EstimateSave,
        Validated<ComponentEstimateResponse>
    >(async (attempt) => {
        const result = await getApi().editEstimate(
            attempt.componentId,
            attempt.input,
        );
        const ids = [
            ...new Set([
                attempt.componentId,
                ...client
                    .getQueryCache()
                    .getAll()
                    .flatMap((q) =>
                        [
                            'component',
                            'componentUsage',
                            'componentMaintenance',
                        ].includes(String(q.queryKey[0])) &&
                        typeof q.queryKey[1] === 'string'
                            ? [q.queryKey[1]]
                            : [],
                    ),
            ]),
        ];
        for (const bikeId of new Set(attempt.affectedBikeIds))
            await invalidateBike(client, bikeId, ids);
        if (!attempt.affectedBikeIds.length) {
            for (const query of client.getQueryCache().getAll())
                if (
                    [
                        'component',
                        'componentUsage',
                        'componentMaintenance',
                        'components',
                    ].includes(String(query.queryKey[0]))
                )
                    await client.resetQueries({ queryKey: query.queryKey });
        }
        return result;
    });
}
export type ComponentDelete = {
    componentId: string;
    expectedVersion: number;
    affectedBikeIds: string[];
};
/** Permanently delete a part; its bikes show the gaps it leaves. */
export function useDeleteComponent() {
    const client = useQueryClient();
    return useMutationRecovery<ComponentDelete, void>(async (attempt) => {
        await getApi().deleteComponent(
            attempt.componentId,
            attempt.expectedVersion,
        );
        for (const queryKey of [
            queryKeys.component(attempt.componentId),
            queryKeys.componentUsage(attempt.componentId),
            queryKeys.componentMaintenance(attempt.componentId),
        ])
            client.removeQueries({ queryKey });
        await invalidateBikes(client, attempt.affectedBikeIds);
    });
}
