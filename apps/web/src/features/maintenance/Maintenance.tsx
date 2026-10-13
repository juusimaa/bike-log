'use client';
import { Temporal } from '@js-temporal/polyfill';
import { formatDateTime } from '../../lib/dates';
import type { MaintenanceResponse, Validated } from '@bikelog/api-client';
import { formatEuroCost } from '../../lib/format';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useMaintenance } from './queries';
import { getApi } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import { ReadError } from '../../components/EmptyState';
const PAGE = 50;
/** Names the serviced part; the history row never shows an internal identifier. */
function ComponentName({ id }: { id: string }) {
    const part = useQuery({
        queryKey: queryKeys.component(id),
        queryFn: ({ signal }) => getApi().getComponent(id, signal),
    });
    if (part.data)
        return (
            <>
                {part.data.make}{' '}
                {part.data.model?.trim() || 'Model not provided'}
            </>
        );
    return <>{part.isError ? 'Part details unavailable' : 'Loading part…'}</>;
}
export function MaintenanceHistory({
    items,
}: {
    items: Validated<MaintenanceResponse>[];
}) {
    const [limit, setLimit] = useState(PAGE);
    const sorted = [...items].sort((a, b) =>
        Temporal.Instant.compare(b.performedUtc, a.performedUtc),
    );
    return (
        <>
            <div className="table-wrap">
                <table className="full-table">
                    <thead>
                        <tr>
                            <th>Work performed</th>
                            <th>Date</th>
                            <th>Component</th>
                            <th>Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.slice(0, limit).map((m) => (
                            <tr key={m.id}>
                                <td>
                                    <strong>{m.task}</strong>
                                    {m.notes !== null && (
                                        <small className="maintenance-note">
                                            {m.notes}
                                        </small>
                                    )}
                                </td>
                                <td>
                                    <time dateTime={m.performedUtc}>
                                        {formatDateTime(m.performedUtc)}
                                    </time>
                                </td>
                                <td>
                                    {m.componentId ? (
                                        <ComponentName id={m.componentId} />
                                    ) : (
                                        'Whole bike'
                                    )}
                                </td>
                                <td>
                                    {m.cost === null
                                        ? 'Cost not recorded'
                                        : m.currency === 'EUR'
                                          ? formatEuroCost(m.cost)
                                          : `${m.cost} ${m.currency ?? 'currency unknown'}`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {sorted.length > limit && (
                <button
                    type="button"
                    className="button secondary table-more"
                    onClick={() => setLimit(limit + PAGE)}
                >
                    Show {Math.min(PAGE, sorted.length - limit)} older records
                </button>
            )}
        </>
    );
}
export function Maintenance({ bikeId }: { bikeId: string }) {
    const history = useMaintenance(bikeId);
    return (
        <section className="card table-card" aria-label="Maintenance history">
            <div className="card-title">
                <h2>Maintenance history</h2>
                {history.data && (
                    <span className="count">
                        {history.data.length}{' '}
                        {history.data.length === 1 ? 'RECORD' : 'RECORDS'}
                    </span>
                )}
            </div>
            <p className="dialog-description">
                Service creates a new chapter. It never resets a component’s
                lifetime mileage.
            </p>
            {history.isPending ? (
                <p role="status">Loading maintenance…</p>
            ) : history.isError ? (
                <ReadError
                    error={history.error}
                    retrying={history.isFetching}
                    onRetry={() => void history.refetch()}
                />
            ) : history.data.length ? (
                <MaintenanceHistory items={history.data} />
            ) : (
                <p>
                    No maintenance recorded yet. Use Log maintenance above to
                    add the first service.
                </p>
            )}
        </section>
    );
}
