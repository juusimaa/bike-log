'use client';
import { useQueryClient } from '@tanstack/react-query';
import type { BikeRef, RideListItem, Validated } from '@bikelog/api-client';
import { useAllRidePages } from './queries';
import { queryKeys } from '../../lib/query';
import { formatDateTime } from '../../lib/dates';
import { formatKilometres, formatDuration } from '../../lib/format';
import { EmptyState, ReadError } from '../../components/EmptyState';
import { selectionUrl } from '../garage/navigation';
export type AllRidesProps = {
    onEdit?: (ride: Validated<RideListItem>) => void;
    onDelete?: (ride: Validated<RideListItem>) => void;
    onOpenBike?: (bikeId: string) => void;
    disabled?: boolean;
};
/** A bike named by the API: a link while it exists, a tagged name once deleted. */
export function BikeName({
    bike,
    onOpen,
}: {
    bike: Validated<BikeRef>;
    onOpen?: (bikeId: string) => void;
}) {
    if (bike.state === 'deleted')
        return (
            <span>
                {bike.displayName}
                <span className="pill quiet title-tag">Deleted</span>
            </span>
        );
    return (
        <span>
            <a
                href={selectionUrl(bike.id, 'overview')}
                onClick={(event) => {
                    if (!onOpen) return;
                    event.preventDefault();
                    onOpen(bike.id);
                }}
            >
                {bike.displayName}
            </a>
            {bike.state === 'retired' && (
                <span className="pill quiet title-tag">Retired</span>
            )}
        </span>
    );
}
export function AllRides({
    onEdit,
    onDelete,
    onOpenBike,
    disabled = false,
}: AllRidesProps) {
    const client = useQueryClient();
    const pages = useAllRidePages();
    const rides = [
        ...new Map(
            pages.data?.pages
                .flatMap((page) => page.items)
                .map((ride) => [ride.id, ride]),
        ).values(),
    ];
    async function refresh() {
        await client.cancelQueries({ queryKey: queryKeys.allRides() });
        await client.resetQueries({ queryKey: queryKeys.allRides() });
    }
    return (
        <section className="card table-card rides-card">
            <div className="card-title">
                <h2>All rides</h2>
                <div className="table-tools">
                    <span className="count">
                        {rides.length}
                        {pages.hasNextPage ? '+' : ''}{' '}
                        {rides.length === 1 && !pages.hasNextPage
                            ? 'RIDE'
                            : 'RIDES'}
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
                    Every ride on every bike, newest first. Correct a ride to
                    move it to another bike.
                    <br />
                    Times are shown in your browser’s local timezone.
                </p>
            </div>
            {pages.error && (
                <ReadError
                    error={pages.error}
                    retrying={pages.isFetching}
                    onRetry={() => void refresh()}
                />
            )}
            {pages.isPending && <p role="status">Loading rides…</p>}
            {!pages.isPending && !pages.error && rides.length === 0 && (
                <EmptyState title="No rides yet">
                    <p>Use Add a ride above to log your first ride.</p>
                </EmptyState>
            )}
            {rides.length > 0 && (
                <div className="table-wrap">
                    <table className="full-table">
                        <thead>
                            <tr>
                                <th>Ride</th>
                                <th>Bike</th>
                                <th>Date</th>
                                <th>Distance</th>
                                <th>Duration</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rides.map((ride) => {
                                const local = formatDateTime(ride.startUtc);
                                return (
                                    <tr key={ride.id}>
                                        <td>{ride.name || local}</td>
                                        <td>
                                            <BikeName
                                                bike={ride.bike}
                                                onOpen={
                                                    disabled
                                                        ? undefined
                                                        : onOpenBike
                                                }
                                            />
                                        </td>
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
