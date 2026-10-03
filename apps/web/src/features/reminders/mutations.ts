import { useQueryClient } from '@tanstack/react-query';
import type { EditReminder } from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { invalidateBike } from '../../lib/query';
import { useMutationRecovery } from '../../lib/mutation';
export function useSaveReminder(bikeId: string) {
    const client = useQueryClient();
    return useMutationRecovery(async (input: EditReminder) => {
        const result = await getApi().editReminder(bikeId, input);
        await invalidateBike(
            client,
            bikeId,
            result.componentId ? [result.componentId] : [],
        );
        return result;
    });
}
