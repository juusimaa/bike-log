'use client';
import { useQueryClient } from '@tanstack/react-query';
import type {
    CreateBike,
    EditBike,
    BikeResponse,
    Validated,
} from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { invalidateBike } from '../../lib/query';
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
