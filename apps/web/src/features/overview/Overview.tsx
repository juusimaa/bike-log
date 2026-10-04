import type { ReactNode } from 'react';
import type {
    Uuid,
    Position,
    InstallationResponse,
    Validated,
} from '@bikelog/api-client';
import { useOverview, useCurrentInstallations } from '../garage/queries';
import { Stats } from './Stats';
import { Activity } from './Activity';
import { BikeArt } from '../../components/BikeArt';
import { ReadError } from '../../components/EmptyState';
import { formatKilometres } from '../../lib/format';
import styles from './Overview.module.css';
export function Overview({
    bikeId,
    onEditBike,
    onViewComponents,
    reminder,
    onReplace,
    onPassport,
}: {
    bikeId: Uuid;
    onEditBike?: () => void;
    onViewComponents?: () => void;
    reminder?: ReactNode;
    onReplace?: (i: Validated<InstallationResponse>) => void;
    onPassport?: (i: Validated<InstallationResponse>) => void;
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
        <div className={styles.overview}>
            <div className={styles.dashboard}>
                <div className={styles.care}>
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
                <div className={styles.bike}>
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
                                            (v) =>
                                                v !== null && v !== undefined,
                                        )
                                        .join(' · ') || 'Metadata not provided'}
                                </p>
                            </div>
                            <div className="hero-actions">
                                <span className="label-pill">
                                    {s.bike.kind
                                        ? `YOUR ${s.bike.kind.toUpperCase()} BIKE`
                                        : 'YOUR BIKE'}
                                </span>
                                <button
                                    className="text-button"
                                    disabled={!onEditBike}
                                    onClick={onEditBike}
                                >
                                    Edit bike
                                </button>
                            </div>
                        </div>
                        <BikeArt color={s.bike.color} />
                        <div className="hero-bottom">
                            <span>
                                ● {s.currentComponents.length} components fitted
                            </span>
                            <button
                                disabled={!onViewComponents}
                                onClick={onViewComponents}
                            >
                                Explore components ↗
                            </button>
                        </div>
                    </section>
                    <Stats snapshot={s} />
                </div>
            </div>
            {s.allocationGaps.map((g, i) => (
                <div className="gap-notice" key={i}>
                    Allocation gap: ride {g.rideId} has no{' '}
                    {g.position.replaceAll('-', ' ')} fitted.
                </div>
            ))}
            <div className="content-grid">
                <section className="card table-card">
                    <div className="card-title">
                        <h2>Currently on your bike</h2>
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
                    <p className={styles.scrollHint}>
                        Scroll horizontally for full status and component
                        actions.
                    </p>
                    <div
                        className="table-wrap"
                        role="region"
                        aria-label="Current components, scroll for more columns"
                        tabIndex={0}
                    >
                        <table>
                            <thead>
                                <tr>
                                    <th>Component</th>
                                    <th>Lifetime</th>
                                    <th>Status</th>
                                    <th>
                                        <span className="visually-hidden">
                                            Actions
                                        </span>
                                    </th>
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
                                                <div className="item-name">
                                                    <span
                                                        className="part-icon"
                                                        aria-hidden="true"
                                                    >
                                                        {position === 'chain'
                                                            ? '⌁'
                                                            : position ===
                                                                'cassette'
                                                              ? '⚙'
                                                              : '◯'}
                                                    </span>
                                                    <span>
                                                        <strong className="position-label">
                                                            {position.replaceAll(
                                                                '-',
                                                                ' ',
                                                            )}
                                                        </strong>
                                                        <small>
                                                            {!usage
                                                                ? '—'
                                                                : identity
                                                                  ? `${identity.component.make} ${identity.component.model?.trim() || 'Model not provided'}`
                                                                  : 'Loading component identity…'}
                                                        </small>
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="number">
                                                {usage
                                                    ? `${formatKilometres(usage.combinedLifetimeMetres)} km`
                                                    : '—'}
                                                {usage &&
                                                    usage.initialUsageEstimateMetres >
                                                        0 && (
                                                        <small className="estimate-label">
                                                            Includes estimate
                                                        </small>
                                                    )}
                                            </td>
                                            <td>
                                                <span
                                                    className={`status ${!usage ? 'gray' : position === 'chain' && s.reminder?.due ? 'amber' : 'green'}`}
                                                >
                                                    {!usage
                                                        ? 'Not fitted'
                                                        : position ===
                                                                'chain' &&
                                                            s.reminder?.due
                                                          ? 'Service reminder'
                                                          : 'Fitted'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="component-actions">
                                                    {identity && (
                                                        <>
                                                            <button
                                                                className="text-button"
                                                                disabled={
                                                                    !onReplace
                                                                }
                                                                onClick={() =>
                                                                    onReplace?.(
                                                                        identity.installation,
                                                                    )
                                                                }
                                                                aria-label={`Replace ${position.replaceAll('-', ' ')}`}
                                                            >
                                                                Replace
                                                            </button>
                                                            <button
                                                                className="row-button"
                                                                disabled={
                                                                    !onPassport
                                                                }
                                                                onClick={() =>
                                                                    onPassport?.(
                                                                        identity.installation,
                                                                    )
                                                                }
                                                                aria-label={`View ${position.replaceAll('-', ' ')} history`}
                                                            >
                                                                ↗
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
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
        </div>
    );
}
