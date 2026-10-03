'use client';
import { useQueryClient } from '@tanstack/react-query';
import type {
    CreateRide,
    CorrectRide,
    RideResponse,
    Validated,
} from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { invalidateBike } from '../../lib/query';
import { useMutationRecovery } from '../../lib/mutation';
export type RideSave = {
    rideId?: string;
    input: CreateRide | CorrectRide;
    affectedBikeIds?: string[];
};
export type RideDelete = {
    rideId: string;
    expectedVersion: number;
    affectedBikeIds?: string[];
};
export function useRideMutations(bikeId: string) {
    const client = useQueryClient();
    async function refreshAffected(otherIds: string[] = []) {
        // A corrected/deleted historical ride can affect a retained component passport.
        // Reset every cached component identity, including identities no longer fitted.
        const componentIds = [
            ...new Set(
                client
                    .getQueryCache()
                    .getAll()
                    .flatMap((query) =>
                        [
                            'component',
                            'componentUsage',
                            'componentMaintenance',
                        ].includes(String(query.queryKey[0])) &&
                        typeof query.queryKey[1] === 'string'
                            ? [query.queryKey[1]]
                            : [],
                    ),
            ),
        ];
        for (const id of new Set([bikeId, ...otherIds])) {
            // Global component/bike keys overlap: serialize resets across bikes.
            await invalidateBike(client, id, componentIds);
        }
    }
    const save = useMutationRecovery<RideSave, Validated<RideResponse>>(
        async (attempt) => {
            const result = attempt.rideId
                ? await getApi().correctRide(
                      attempt.rideId,
                      attempt.input as CorrectRide,
                  )
                : await getApi().createRide(attempt.input);
            await refreshAffected([
                result.bikeId,
                ...(attempt.affectedBikeIds ?? []),
            ]);
            return result;
        },
    );
    const remove = useMutationRecovery<RideDelete, void>(async (attempt) => {
        await getApi().deleteRide(attempt.rideId, attempt.expectedVersion);
        await refreshAffected(attempt.affectedBikeIds);
    });
    return { save, remove };
}
