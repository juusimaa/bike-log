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
    if (bike) return <span>{bike.displayName}</span>;
    const looking =
        (bikes.isPending || isFetchingNextPage || hasNextPage) &&
        !bikes.isError &&
        !isFetchNextPageError;
    if (looking) return <span>Looking up bike…</span>;
    return (
        <span>
            Unresolved bike {bikeId}{' '}
            <button
                type="button"
                className="text-button"
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
