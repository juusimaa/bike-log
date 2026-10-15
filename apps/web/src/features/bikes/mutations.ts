'use client';
import { useQueryClient } from '@tanstack/react-query';
import type {
    CreateBike,
    EditBike,
    BikeResponse,
    BikeStatus,
    Validated,
} from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { invalidateBike, invalidateBikes, queryKeys } from '../../lib/query';
import { useMutationRecovery } from '../../lib/mutation';
export type BikeSave = { bikeId: string | null; input: CreateBike | EditBike };
export function useSaveBike() {
    const client = useQueryClient();
    return useMutationRecovery<BikeSave, Validated<BikeResponse>>(
        async ({ bikeId, input }) => {
            const result = bikeId
                ? await getApi().editBike(bikeId, input as EditBike)
                : await getApi().createBike(input);
            await invalidateBike(client, result.id);
            return result;
        },
    );
}
export type BikeStatusSave = {
    bikeId: string;
    status: BikeStatus;
    expectedVersion: number;
};
/** Retire or reactivate; the bike's overview, reminder and the switcher refresh. */
export function useSetBikeStatus() {
    const client = useQueryClient();
    return useMutationRecovery<BikeStatusSave, Validated<BikeResponse>>(
        async ({ bikeId, status, expectedVersion }) => {
            const result = await getApi().setBikeStatus(bikeId, {
                status,
                expectedVersion,
            });
            await invalidateBike(client, bikeId);
            return result;
        },
    );
}
/** After a bike is gone: refresh shared lists, then drop the bike's own cached reads. */
export async function forgetDeletedBike(
    client: ReturnType<typeof useQueryClient>,
    bikeId: string,
) {
    for (const queryKey of [
        queryKeys.bike(bikeId),
        queryKeys.overview(bikeId),
        queryKeys.rides(bikeId),
        queryKeys.installations(bikeId, 'current'),
        queryKeys.installations(bikeId, 'all'),
        queryKeys.maintenance(bikeId),
        queryKeys.reminder(bikeId),
        queryKeys.exemptions(bikeId),
        queryKeys.deletionPreview(bikeId),
    ])
        client.removeQueries({ queryKey });
    // Kept parts and their passports changed too.
    for (const query of client.getQueryCache().getAll())
        if (
            ['component', 'componentUsage', 'componentMaintenance'].includes(
                String(query.queryKey[0]),
            )
        )
            client.removeQueries({ queryKey: query.queryKey });
    await invalidateBikes(client, []);
}
