import { useEffect } from 'react';
import { useBikes } from '../garage/queries';
export function BikeIdentity({ bikeId }: { bikeId: string }) {
    const bikes = useBikes();
    const bike = bikes.data?.pages
        .flatMap((p) => p.items)
        .find((b) => b.id === bikeId);
    const {
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
    } = bikes;
    useEffect(() => {
        if (
            !bike &&
            hasNextPage &&
            !isFetchingNextPage &&
            !isFetchNextPageError
        )
            void fetchNextPage();
    }, [
        bike,
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
    ]);
    return bike ? (
        <span>{bike.displayName}</span>
    ) : (
        <span>
            Unresolved bike {bikeId}{' '}
            <button
                onClick={() =>
                    void (bikes.isFetchNextPageError
                        ? bikes.fetchNextPage()
                        : bikes.refetch())
                }
            >
                Retry bike lookup
            </button>
        </span>
    );
}
