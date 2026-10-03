import { useQuery } from '@tanstack/react-query';
import { getApi } from '../../lib/api';
import { queryKeys } from '../../lib/query';
export function useReminder(bikeId: string) {
    return useQuery({
        queryKey: queryKeys.reminder(bikeId),
        queryFn: ({ signal }) => getApi().getReminder(bikeId, signal),
    });
}
