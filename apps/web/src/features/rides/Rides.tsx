'use client';
import { useQueryClient } from '@tanstack/react-query';
import type { RideResponse, Validated } from '@bikelog/api-client';
import { useRidePages } from './queries';
import { useOverview } from '../garage/queries';
import { queryKeys } from '../../lib/query';
import { formatDateTime } from '../../lib/dates';
import { formatKilometres, formatDuration } from '../../lib/format';
import { EmptyState, ReadError } from '../../components/EmptyState';
export type RidesProps = {
    bikeId: string;
    onEdit?: (ride: Validated<RideResponse>) => void;
    onDelete?: (ride: Validated<RideResponse>) => void;
    disabled?: boolean;
};
export function Rides({
    bikeId,
    onEdit,
    onDelete,
    disabled = false,
}: RidesProps) {
    const client = useQueryClient();
    const pages = useRidePages(bikeId);
    const overview = useOverview(bikeId);
    const rides = [
        ...new Map(
            pages.data?.pages
                .flatMap((page) => page.items)
                .map((ride) => [ride.id, ride]),
        ).values(),
    ];
    async function refresh() {
        await client.cancelQueries({ queryKey: queryKeys.rides(bikeId) });
        await client.resetQueries({ queryKey: queryKeys.rides(bikeId) });
        await overview.refetch();
    }
    return (
        <section className="card table-card rides-card">
            <div className="card-title">
                <h2>Your ride log</h2>
                <div className="table-tools">
                    <span className="count">
                        {rides.length}
                        {pages.hasNextPage ? '+' : ''} RIDES
                    </span>
                    <button
                        className="text-button"
                        disabled={disabled || pages.isFetching}
                        onClick={() => void refresh()}
                    >
                        Refresh rides
                    </button>
                </div>
            </div>
            <div className="section-intro">
                <p>
                    Each ride belongs to the components fitted at its start.
                    <br />
                    Times are shown in your browser’s local timezone.
                </p>
            </div>
            {pages.error && (
                <ReadError error={pages.error} onRetry={() => void refresh()} />
            )}
            {pages.isPending && <p role="status">Loading rides…</p>}
            {overview.error && (
                <p>
                    Allocation information unavailable. Refresh to check
                    installation history.
                </p>
            )}
            {!pages.isPending && !pages.error && rides.length === 0 && (
                <EmptyState title="No rides yet">
                    <p>Log your first ride.</p>
                </EmptyState>
            )}
            {rides.length > 0 && (
                <div className="table-wrap">
                    <table className="full-table">
                        <thead>
                            <tr>
                                <th>Ride</th>
                                <th>Date</th>
                                <th>Distance</th>
                                <th>Duration</th>
                                <th>Allocation</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rides.map((ride) => {
                                const local = formatDateTime(
                                    ride.startUtc,
                                ).replace('T', ' ');
                                const gaps =
                                    overview.data?.allocationGaps.filter(
                                        (gap) => gap.rideId === ride.id,
                                    );
                                return (
                                    <tr key={ride.id}>
                                        <td>{ride.name || local}</td>
                                        <td>
                                            <time dateTime={ride.startUtc}>
                                                {local}
                                            </time>
                                        </td>
                                        <td>
                                            {formatKilometres(
                                                ride.distanceMetres,
                                            )}{' '}
                                            km
                                        </td>
                                        <td>
                                            {formatDuration(
                                                ride.durationSeconds,
                                            )}
                                        </td>
                                        <td>
                                            {!overview.data ||
                                            overview.error ? (
                                                'Allocation not checked'
                                            ) : gaps?.length ? (
                                                gaps.map((gap) => (
                                                    <p key={gap.position}>
                                                        {gap.position}: missing
                                                        installation history
                                                    </p>
                                                ))
                                            ) : (
                                                <span className="status green">
                                                    Fully allocated
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="row-actions">
                                                <button
                                                    disabled={
                                                        disabled || !onEdit
                                                    }
                                                    aria-label={`Correct ${ride.name || local}`}
                                                    onClick={() =>
                                                        onEdit?.(ride)
                                                    }
                                                >
                                                    Correct
                                                </button>
                                                <button
                                                    disabled={
                                                        disabled || !onDelete
                                                    }
                                                    aria-label={`Delete ${ride.name || local}`}
                                                    onClick={() =>
                                                        onDelete?.(ride)
                                                    }
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {pages.hasNextPage && (
                <button
                    disabled={pages.isFetchingNextPage}
                    onClick={() => void pages.fetchNextPage()}
                >
                    Load more
                </button>
            )}
        </section>
    );
}
