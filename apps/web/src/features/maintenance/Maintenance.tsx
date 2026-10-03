'use client';
import { Temporal } from '@js-temporal/polyfill';
import { formatDateTime } from '../../lib/dates';
import type { MaintenanceResponse, Validated } from '@bikelog/api-client';
import { formatEuroCost } from '../../lib/format';
import { useMaintenance } from './queries';
export function MaintenanceHistory({
    items,
}: {
    items: Validated<MaintenanceResponse>[];
}) {
    return (
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
                    {[...items]
                        .sort((a, b) =>
                            Temporal.Instant.compare(
                                b.performedUtc,
                                a.performedUtc,
                            ),
                        )
                        .map((m) => (
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
                                    {m.componentId
                                        ? `Component ${m.componentId}`
                                        : 'Whole bike'}
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
    );
}
export function Maintenance({ bikeId }: { bikeId: string }) {
    const history = useMaintenance(bikeId);
    return (
        <section className="card table-card" aria-label="Maintenance history">
            <div className="card-title">
                <h2>Maintenance history</h2>
                {history.data && (
                    <span className="count">{history.data.length} RECORDS</span>
                )}
            </div>
            <p className="dialog-description">
                Service creates a new chapter. It never resets a component’s
                lifetime mileage.
            </p>
            {history.isPending ? (
                <p>Loading maintenance…</p>
            ) : history.isError ? (
                <p role="alert">Unable to load maintenance.</p>
            ) : history.data.length ? (
                <MaintenanceHistory items={history.data} />
            ) : (
                <p>No maintenance recorded.</p>
            )}
        </section>
    );
}
