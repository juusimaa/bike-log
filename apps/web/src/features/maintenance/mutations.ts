import { useQueryClient } from '@tanstack/react-query';
import type { CreateMaintenance } from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { invalidateBike } from '../../lib/query';
import { useMutationRecovery } from '../../lib/mutation';
export function useSaveMaintenance() {
    const client = useQueryClient();
    return useMutationRecovery(async (input: CreateMaintenance) => {
        const result = await getApi().createMaintenance(input);
        await invalidateBike(
            client,
            input.bikeId,
            input.componentId ? [input.componentId] : [],
        );
        return result;
    });
}
