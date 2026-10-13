import type { ReactNode } from 'react';
import type {
    Uuid,
    InstallationResponse,
    Validated,
} from '@bikelog/api-client';
import { useEffect, useState } from 'react';
import {
    useComponentCatalog,
    groupLabel,
    positionLabel,
} from '../components/catalog';
import { formatDate } from '../../lib/dates';
import { formatKilograms } from '../../lib/format';
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
    const catalog = useComponentCatalog().data;
    const [allGaps, setAllGaps] = useState(false);
    const {
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
    } = fitted;
    // Identities can sit on a later page; load them all so no row waits forever.
    useEffect(() => {
        if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError)
            void fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
    const identitiesSettled =
        fitted.isError ||
        isFetchNextPageError ||
        (fitted.isSuccess && !hasNextPage);
    if (overview.error)
        return (
            <ReadError
                error={overview.error}
                retrying={overview.isFetching}
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
                            <p>Service reminders are unavailable right now.</p>
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
                        <BikeArt color={s.bike.color} kind={s.bike.kind} />
                        <div className="hero-bottom">
                            <span>
                                ● {s.currentComponents.length}{' '}
                                {s.currentComponents.length === 1
                                    ? 'component'
                                    : 'components'}{' '}
                                fitted
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
            {s.bike.missingPositions.length > 0 && (
                <div className="notice" role="status">
                    <p>
                        This bike is incomplete:{' '}
                        {s.bike.missingPositions.map((position, i) => {
                            const since = s.positionStatuses.find(
                                (x) => x.position === position,
                            )?.sinceUtc;
                            return (
                                <span key={position}>
                                    {i > 0 && ', '}
                                    <strong>
                                        {positionLabel(
                                            catalog,
                                            position,
                                        ).toLowerCase()}
                                    </strong>{' '}
                                    missing
                                    {since ? ` since ${formatDate(since)}` : ''}
                                </span>
                            );
                        })}
                        . Rides can still be logged; they will show a gap for
                        the missing{' '}
                        {s.bike.missingPositions.length === 1
                            ? 'part'
                            : 'parts'}
                        .
                    </p>
                    {onViewComponents && (
                        <div className="notice-actions">
                            <button
                                type="button"
                                className="button small secondary"
                                onClick={onViewComponents}
                            >
                                View parts
                            </button>
                        </div>
                    )}
                </div>
            )}
            <div className="overview-side">
                <section className="gaps-card" aria-labelledby="gaps-title">
                    <h2 id="gaps-title">Usage gaps</h2>
                    <p>
                        Rides that started while a position had no recorded
                        part. Those rides add no usage for that position;
                        nothing is estimated.
                    </p>
                    {s.positionGaps.length === 0 ? (
                        <p className="no-gap">
                            No gaps. Every ride is fully allocated.
                        </p>
                    ) : (
                        <>
                            {(allGaps
                                ? s.positionGaps
                                : s.positionGaps.slice(0, 3)
                            ).map((g) => {
                                const missing =
                                    s.positionStatuses.find(
                                        (x) => x.position === g.position,
                                    )?.state === 'missing';
                                return (
                                    <div className="gap-line" key={g.position}>
                                        <span
                                            className={`pill ${missing ? 'missing' : 'quiet'}`}
                                        >
                                            {missing
                                                ? 'Missing'
                                                : 'Not recorded'}
                                        </span>
                                        <div>
                                            <strong>
                                                {positionLabel(
                                                    catalog,
                                                    g.position,
                                                )}
                                            </strong>{' '}
                                            not recorded for {g.rideCount}{' '}
                                            {g.rideCount === 1
                                                ? 'ride'
                                                : 'rides'}
                                            <small>
                                                {formatDate(
                                                    g.firstRideStartUtc,
                                                )}{' '}
                                                –{' '}
                                                {formatDate(g.lastRideStartUtc)}
                                            </small>
                                        </div>
                                    </div>
                                );
                            })}
                            {s.positionGaps.length > 3 && (
                                <button
                                    type="button"
                                    className="text-button"
                                    aria-expanded={allGaps}
                                    onClick={() => setAllGaps((v) => !v)}
                                >
                                    {allGaps
                                        ? 'Show fewer'
                                        : `Show all ${s.positionGaps.length} positions`}
                                </button>
                            )}
                        </>
                    )}
                </section>
                <section className="fitted-card" aria-labelledby="weight-title">
                    <h2 id="weight-title">Weight by group</h2>
                    {s.weights.groups.map((g) => (
                        <div className="group-mini" key={g.group}>
                            <span>{groupLabel(g.group)}</span>
                            <span className="tabular">
                                <strong>{formatKilograms(g.grams)}</strong>
                                {g.missingCount > 0 && (
                                    <small>
                                        {g.missingCount}{' '}
                                        {g.missingCount === 1
                                            ? 'part'
                                            : 'parts'}{' '}
                                        without weight
                                    </small>
                                )}
                            </span>
                        </div>
                    ))}
                    <div className="group-mini">
                        <span>Frame</span>
                        <span className="tabular">
                            {s.weights.frameGrams === null ? (
                                <small>Weight not recorded</small>
                            ) : (
                                <strong>
                                    {formatKilograms(s.weights.frameGrams)}
                                </strong>
                            )}
                        </span>
                    </div>
                </section>
            </div>
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
                            retrying={fitted.isFetching}
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
                                {s.currentComponents
                                    .map(({ position }) => position)
                                    .map((position) => {
                                        const usage = s.currentComponents.find(
                                            (c) => c.position === position,
                                        );
                                        const identity = usage
                                            ? identities.get(
                                                  usage.installationId,
                                              )
                                            : undefined;
                                        return (
                                            <tr key={position}>
                                                <td>
                                                    <div className="item-name">
                                                        <span>
                                                            <strong className="position-label">
                                                                {positionLabel(
                                                                    catalog,
                                                                    position,
                                                                )}
                                                            </strong>
                                                            <small>
                                                                {!usage
                                                                    ? '—'
                                                                    : identity
                                                                      ? `${identity.component.make} ${identity.component.model?.trim() || 'Model not provided'}`
                                                                      : identitiesSettled
                                                                        ? 'Part details unavailable'
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
                                                                Includes
                                                                estimate
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
                                                                    aria-label={`Replace ${positionLabel(catalog, position).toLowerCase()}`}
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
                                                                    aria-label={`View ${positionLabel(catalog, position).toLowerCase()} history`}
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
                    {isFetchNextPageError && (
                        <button
                            type="button"
                            className="button secondary"
                            disabled={isFetchingNextPage}
                            onClick={() => void fetchNextPage()}
                        >
                            Retry loading components
                        </button>
                    )}
                </section>
                <Activity snapshot={s} />
            </div>
        </div>
    );
}
