'use client';
import { useEffect } from 'react';
import type {
    ComponentResponse,
    InstallationResponse,
    MaintenanceResponse,
    Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { usePassport, useInstallationPages } from './queries';
import { useReminder } from '../reminders/queries';
import { BikeIdentity } from './BikeIdentity';
import { formatDate } from '../../lib/dates';
import {
    formatKilometres,
    formatDuration,
    formatEuroCost,
    formatGrams,
} from '../../lib/format';
import {
    useComponentCatalog,
    positionLabel,
    typeLabel,
    capitalised,
} from './catalog';
function CurrentStatus({
    bikeId,
    installationId,
}: {
    bikeId: string;
    installationId: string;
}) {
    const current = useInstallationPages(bikeId, 'current');
    const {
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
    } = current;
    useEffect(() => {
        if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError)
            void fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
    const fitted = current.data?.pages.some((p) =>
        p.items.some((r) => r.installation.id === installationId),
    );
    const failed = current.isError || isFetchNextPageError;
    if (fitted) return <span className="pill fitted">Currently fitted</span>;
    if (current.isSuccess && !current.hasNextPage)
        return <span className="pill quiet">Not currently fitted</span>;
    if (!failed) return <span>Checking current status…</span>;
    return (
        <span>
            Current status unavailable.{' '}
            <button onClick={() => void current.refetch()}>
                Retry current status
            </button>
        </span>
    );
}
/** "Is this part due?" — the bike's reminder when it follows this part, then the latest service. */
/** Hidden when it has nothing to add; Service history below names the empty case. */
function ServiceStatus({
    componentId,
    fittedTo,
    latest,
}: {
    componentId: string;
    fittedTo: string | null;
    latest: Validated<MaintenanceResponse> | undefined;
}) {
    return (
        <section className="passport-service" aria-label="Service status">
            {fittedTo && (
                <ReminderStatus bikeId={fittedTo} componentId={componentId} />
            )}
            {latest && (
                <p>
                    Last service: {latest.task} ·{' '}
                    {formatDate(latest.performedUtc)}
                </p>
            )}
        </section>
    );
}
function ReminderStatus({
    bikeId,
    componentId,
}: {
    bikeId: string;
    componentId: string;
}) {
    const e = useReminder(bikeId).data;
    if (!e || e.state !== 'ready' || e.componentId !== componentId) return null;
    const since = e.distanceSinceBaselineMetres,
        every = e.activeThresholdMetres;
    return (
        <>
            {e.due ? (
                <span className="pill missing">Lubrication due</span>
            ) : e.remainingMetres !== null ? (
                <span className="pill fitted">
                    {formatKilometres(e.remainingMetres)} km until lubrication
                </span>
            ) : null}
            {since !== null && every !== null && (
                <p>
                    {formatKilometres(since)} km since{' '}
                    {e.baselineKind === 'installation'
                        ? 'installation'
                        : 'service'}{' '}
                    · reminder every {formatKilometres(every)} km. A distance
                    prompt, not a wear measurement.
                </p>
            )}
        </>
    );
}
function plural(n: number, word: string) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}
export function ComponentPassport({
    componentId,
    onClose,
    onEditEstimate,
    onEditDetails,
    onMove,
    onRemove,
}: {
    componentId: string;
    onClose: () => void;
    onEditEstimate?: (component: Validated<ComponentResponse>) => void;
    onEditDetails?: (component: Validated<ComponentResponse>) => void;
    onMove?: (
        installation: Validated<InstallationResponse>,
        component: Validated<ComponentResponse>,
    ) => void;
    onRemove?: (
        installation: Validated<InstallationResponse>,
        component: Validated<ComponentResponse>,
    ) => void;
}) {
    const { detail, usage, maintenance } = usePassport(componentId);
    const catalog = useComponentCatalog().data;
    const open = detail.data?.installations.find((i) => i.endUtc === null);
    const c = detail.data,
        u = usage.data;
    // Newest first, as the API pages them.
    const services = [
        ...new Map(
            (maintenance.data?.pages.flatMap((p) => p.items) ?? []).map((m) => [
                m.id,
                m,
            ]),
        ).values(),
    ];
    const history = c
        ? [...c.installations].sort((a, b) =>
              b.startUtc.localeCompare(a.startUtc),
          )
        : [];
    const bikes = new Set(history.map((i) => i.bikeId)).size;
    const type = c ? capitalised(typeLabel(catalog, c.type)) : '';
    const openPosition = open ? positionLabel(catalog, open.position) : '';
    return (
        <Dialog
            open
            wide
            title={c ? `${c.make} ${c.model}` : 'History and details'}
            description={
                c && (
                    <>
                        {type} ·{' '}
                        {open ? (
                            <>
                                {openPosition.toLowerCase() !==
                                    type.toLowerCase() &&
                                    `${openPosition.toLowerCase()} `}
                                on <BikeIdentity bikeId={open.bikeId} /> since{' '}
                                {formatDate(open.startUtc)}
                            </>
                        ) : (
                            'in your garage'
                        )}
                    </>
                )
            }
            footer={
                <button
                    type="button"
                    className="button secondary"
                    onClick={onClose}
                >
                    Close
                </button>
            }
            onCancel={onClose}
        >
            {detail.isPending && <p>Loading part…</p>}
            {detail.isError && (
                <p role="alert">
                    Couldn’t load this part.{' '}
                    <button onClick={() => void detail.refetch()}>
                        Retry component
                    </button>
                </p>
            )}
            {c && (
                <>
                    <div className="passport-stats">
                        <div>
                            <span>Lifetime</span>
                            <strong className="tabular">
                                {u
                                    ? `${formatKilometres(u.combinedLifetimeMetres)} km`
                                    : '—'}
                            </strong>
                            {u ? (
                                <>
                                    <small>
                                        {c.initialUsageEstimateMetres > 0
                                            ? `${formatKilometres(u.lifetimeMetres)} km from rides + ${formatKilometres(c.initialUsageEstimateMetres)} km estimate`
                                            : 'from recorded rides'}
                                    </small>
                                    <small>
                                        {!u.hasUnknownDuration
                                            ? `${formatDuration(u.lifetimeSeconds)} ridden`
                                            : u.lifetimeSeconds
                                              ? `At least ${formatDuration(u.lifetimeSeconds)} ridden; some rides have no duration`
                                              : 'Duration not recorded'}
                                    </small>
                                </>
                            ) : (
                                <small>
                                    {usage.isError
                                        ? 'Distance unavailable'
                                        : 'Loading distance…'}
                                </small>
                            )}
                        </div>
                        <div>
                            <span>Weight</span>
                            <strong className="tabular">
                                {c.weightGrams === null
                                    ? '—'
                                    : formatGrams(c.weightGrams)}
                            </strong>
                            <small>
                                {c.weightGrams === null
                                    ? 'not recorded'
                                    : 'as entered'}
                            </small>
                        </div>
                        <div>
                            <span>Fitted</span>
                            <strong className="tabular">
                                {plural(history.length, 'time')}
                            </strong>
                            <small>
                                {bikes === 0
                                    ? 'never fitted to a bike'
                                    : bikes === 1
                                      ? 'on one bike'
                                      : `on ${bikes} bikes`}
                            </small>
                        </div>
                    </div>
                    {usage.isError && (
                        <p role="alert">
                            Couldn’t load distance and duration.{' '}
                            <button onClick={() => void usage.refetch()}>
                                Retry usage
                            </button>
                        </p>
                    )}
                    <ServiceStatus
                        componentId={c.id}
                        fittedTo={open?.bikeId ?? null}
                        latest={services[0]}
                    />
                    <h3>Installation history</h3>
                    <ol className="history">
                        {history.length === 0 && (
                            <li>
                                <span>Never fitted to a bike.</span>
                            </li>
                        )}
                        {history.map((i) => {
                            const chapter = u?.installations.find(
                                (x) => x.installation.id === i.id,
                            );
                            return (
                                <li key={i.id}>
                                    <span>
                                        <strong>
                                            <BikeIdentity bikeId={i.bikeId} />
                                        </strong>{' '}
                                        ·{' '}
                                        {positionLabel(
                                            catalog,
                                            i.position,
                                        ).toLowerCase()}
                                        <small>
                                            {formatDate(i.startUtc)} –{' '}
                                            {i.endUtc
                                                ? formatDate(i.endUtc)
                                                : 'now'}
                                        </small>
                                        {i.endUtc === null && (
                                            <small>
                                                <CurrentStatus
                                                    bikeId={i.bikeId}
                                                    installationId={i.id}
                                                />
                                            </small>
                                        )}
                                    </span>
                                    <span className="history-figure">
                                        {chapter ? (
                                            <>
                                                <span className="tabular">
                                                    {formatKilometres(
                                                        chapter.metres,
                                                    )}{' '}
                                                    km
                                                </span>
                                                <small>
                                                    {!chapter.hasUnknownDuration
                                                        ? formatDuration(
                                                              chapter.seconds,
                                                          )
                                                        : chapter.seconds
                                                          ? `at least ${formatDuration(chapter.seconds)}`
                                                          : 'duration not recorded'}
                                                </small>
                                            </>
                                        ) : (
                                            <small>Distance unavailable</small>
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </>
            )}
            <h3>Service history</h3>
            <p className="passport-note">
                Includes service done while it was on other bikes.
            </p>
            {maintenance.isPending && <p>Loading service history…</p>}
            {maintenance.isError && (
                <p role="alert">
                    Couldn’t load service history.{' '}
                    <button onClick={() => void maintenance.refetch()}>
                        Retry component maintenance
                    </button>
                </p>
            )}
            {maintenance.isSuccess &&
                services.length === 0 &&
                !maintenance.hasNextPage && (
                    <p>No service recorded for this part yet.</p>
                )}
            {services.length > 0 && (
                <ol className="history">
                    {services.map((m) => (
                        <li key={m.id}>
                            <span>
                                <strong>{m.task}</strong>
                                <small>
                                    {formatDate(m.performedUtc)} · on{' '}
                                    <BikeIdentity bikeId={m.bikeId} />
                                </small>
                                {m.notes && <small>{m.notes}</small>}
                            </span>
                            <span className="history-figure">
                                {m.cost === null ? (
                                    <small>Cost unknown</small>
                                ) : (
                                    <span className="tabular">
                                        {m.currency === 'EUR'
                                            ? formatEuroCost(m.cost)
                                            : `${m.cost} ${m.currency ?? 'currency unknown'}`}
                                    </span>
                                )}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
            {maintenance.hasNextPage && (
                <button
                    disabled={maintenance.isFetchingNextPage}
                    onClick={() => void maintenance.fetchNextPage()}
                >
                    {maintenance.isFetchingNextPage
                        ? 'Loading service history…'
                        : 'Load more service history'}
                </button>
            )}
            {c && (
                <>
                    <div className="passport-actions">
                        {onEditDetails && (
                            <button
                                className="button small secondary"
                                onClick={() => onEditDetails(c)}
                            >
                                Edit details
                            </button>
                        )}
                        {onEditEstimate && (
                            <button
                                className="button small secondary"
                                onClick={() => onEditEstimate(c)}
                            >
                                Edit starting estimate
                            </button>
                        )}
                        {open && onMove && (
                            <button
                                className="button small secondary"
                                onClick={() => onMove(open, c)}
                            >
                                Move to another bike
                            </button>
                        )}
                        {open && onRemove && (
                            <button
                                className="button small secondary"
                                onClick={() => onRemove(open, c)}
                            >
                                Remove from bike
                            </button>
                        )}
                    </div>
                    <details className="passport-technical">
                        <summary>Technical details</summary>
                        <p>Component ID: {c.id}</p>
                    </details>
                </>
            )}
        </Dialog>
    );
}
