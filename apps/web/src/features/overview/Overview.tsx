import type { ReactNode } from 'react';
import type { Uuid, Position } from '@bikelog/api-client';
import { useOverview, useCurrentInstallations } from '../garage/queries';
import { Stats } from './Stats';
import { Activity } from './Activity';
import { BikeArt } from '../../components/BikeArt';
import { ReadError } from '../../components/EmptyState';
import { formatKilometres, formatMinutes } from '../../lib/format';
export function Overview({
    bikeId,
    onEditBike,
    onViewComponents,
    reminder,
}: {
    bikeId: Uuid;
    onEditBike?: () => void;
    onViewComponents?: () => void;
    reminder?: ReactNode;
}) {
    const overview = useOverview(bikeId);
    const fitted = useCurrentInstallations(bikeId);
    if (overview.error)
        return (
            <ReadError
                error={overview.error}
                onRetry={() => void overview.refetch()}
            />
        );
    if (!overview.data) return <p role="status">Loading overview…</p>;
    const s = overview.data;
    const identities = new Map(
        fitted.data?.pages
            .flatMap((p) => p.items)
            .map((i) => [i.installation.id, i]),
    );
    return (
        <>
            <div className="dashboard-grid">
                <section className="card hero">
                    <div className="hero-top">
                        <div>
                            <h2>{s.bike.displayName}</h2>
                            <p>
                                {[
                                    s.bike.make,
                                    s.bike.model,
                                    s.bike.year,
                                    s.bike.kind,
                                ]
                                    .filter(
                                        (v) => v !== null && v !== undefined,
                                    )
                                    .join(' · ') || 'Metadata not provided'}
                            </p>
                        </div>
                        <span className="label-pill">Your bike</span>
                    </div>
                    <BikeArt />
                    <div className="hero-bottom">
                        <span>Your rides and service, together</span>
                        <button disabled={!onEditBike} onClick={onEditBike}>
                            Edit bike →
                        </button>
                    </div>
                </section>
                {reminder ?? (
                    <section className="card service-card">
                        <div className="card-title">
                            <h2>Chain care</h2>
                        </div>
                        <p>
                            Reminder controls will be connected in the
                            maintenance step.
                        </p>
                    </section>
                )}
            </div>
            <Stats snapshot={s} />
            {s.allocationGaps.map((g, i) => (
                <div className="gap-notice" key={i}>
                    Allocation gap: ride {g.rideId} has no{' '}
                    {g.position.replaceAll('-', ' ')} fitted.
                </div>
            ))}
            <div className="content-grid">
                <section className="card table-card">
                    <div className="card-title">
                        <h2>Current components</h2>
                        <button
                            className="text-button"
                            onClick={onViewComponents}
                        >
                            View all →
                        </button>
                    </div>
                    {s.currentComponents.length === 0 && (
                        <p>
                            No components fitted yet.{' '}
                            <button
                                className="text-button"
                                disabled={!onViewComponents}
                                onClick={onViewComponents}
                            >
                                Fit component →
                            </button>
                        </p>
                    )}
                    {fitted.error && (
                        <ReadError
                            error={fitted.error}
                            onRetry={() => void fitted.refetch()}
                        />
                    )}
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Component</th>
                                    <th>Recorded usage</th>
                                    <th>Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(
                                    [
                                        'chain',
                                        'cassette',
                                        'front-tyre',
                                        'rear-tyre',
                                    ] as Position[]
                                ).map((position) => {
                                    const usage = s.currentComponents.find(
                                        (c) => c.position === position,
                                    );
                                    const identity = usage
                                        ? identities.get(usage.installationId)
                                        : undefined;
                                    return (
                                        <tr key={position}>
                                            <td>
                                                <strong>
                                                    {position.replaceAll(
                                                        '-',
                                                        ' ',
                                                    )}
                                                </strong>
                                                <small className="estimate-label">
                                                    {!usage
                                                        ? 'Not fitted'
                                                        : identity
                                                          ? `${identity.component.make} ${identity.component.model?.trim() || 'Model not provided'}`
                                                          : 'Loading component identity…'}
                                                </small>
                                            </td>
                                            <td>
                                                {usage
                                                    ? `${formatKilometres(usage.currentInstallationMetres)} km`
                                                    : '—'}
                                            </td>
                                            <td>
                                                {usage
                                                    ? `${formatMinutes(usage.currentInstallationSeconds) + (usage.currentInstallationSeconds % 3 === 0 ? ' min' : '')}${usage.currentInstallationHasUnknownDuration ? ' + unknown duration' : ''}`
                                                    : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {fitted.hasNextPage && (
                        <button
                            className="button secondary"
                            disabled={fitted.isFetchingNextPage}
                            onClick={() => void fitted.fetchNextPage()}
                        >
                            Load more current components
                        </button>
                    )}
                </section>
                <Activity snapshot={s} />
            </div>
        </>
    );
}
