'use client';
import { useEffect } from 'react';
import type {
    ComponentResponse,
    InstallationResponse,
    Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { usePassport, useInstallationPages } from './queries';
import { BikeIdentity } from './BikeIdentity';
import { formatDateTime } from '../../lib/dates';
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
    return (
        <span>
            {fitted
                ? 'Currently fitted'
                : current.isSuccess && !current.hasNextPage
                  ? 'Not currently fitted'
                  : failed
                    ? 'Current status unavailable. '
                    : 'Checking current status…'}
            {failed && (
                <button onClick={() => void current.refetch()}>
                    Retry current status
                </button>
            )}
        </span>
    );
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
    const services = [
        ...new Map(
            (maintenance.data?.pages.flatMap((p) => p.items) ?? []).map(
                (m) => [m.id, m],
            ),
        ).values(),
    ];
    return (
        <Dialog
            open
            title={c ? `${c.make} ${c.model}` : 'History and details'}
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
                    <p>Type: {capitalised(typeLabel(catalog, c.type))}</p>
                    <p>
                        Weight:{' '}
                        {c.weightGrams === null
                            ? 'not recorded'
                            : formatGrams(c.weightGrams)}
                    </p>
                    <div className="passport-actions">
                        {onEditDetails && (
                            <button
                                className="button small secondary"
                                onClick={() => onEditDetails(c)}
                            >
                                Edit details
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
                    <p>
                        Starting estimate:{' '}
                        {formatKilometres(c.initialUsageEstimateMetres)} km
                    </p>
                    {onEditEstimate && (
                        <button onClick={() => onEditEstimate(c)}>
                            Edit starting estimate
                        </button>
                    )}
                    {u && (
                        <>
                            <p>
                                Calculated lifetime:{' '}
                                {formatKilometres(u.lifetimeMetres)} km
                            </p>
                            <p>
                                Combined lifetime:{' '}
                                {formatKilometres(u.combinedLifetimeMetres)} km
                            </p>
                            <p>
                                {u.hasUnknownDuration
                                    ? 'Duration incomplete; known recorded duration: '
                                    : 'Recorded duration: '}
                                {formatDuration(u.lifetimeSeconds)}
                            </p>
                        </>
                    )}
                    {usage.isError && (
                        <p role="alert">
                            Couldn’t load distance and duration.{' '}
                            <button onClick={() => void usage.refetch()}>
                                Retry usage
                            </button>
                        </p>
                    )}
                    <h3>Installation history</h3>
                    {c.installations.length === 0 && (
                        <p>Never fitted to a bike.</p>
                    )}
                    {c.installations.map((i) => {
                        const chapter = u?.installations.find(
                            (x) => x.installation.id === i.id,
                        );
                        return (
                            <article key={i.id}>
                                <BikeIdentity bikeId={i.bikeId} />
                                <p>
                                    {positionLabel(catalog, i.position)} ·{' '}
                                    {formatDateTime(i.startUtc)} —{' '}
                                    {i.endUtc
                                        ? formatDateTime(i.endUtc)
                                        : 'now'}
                                </p>
                                <CurrentStatus
                                    bikeId={i.bikeId}
                                    installationId={i.id}
                                />
                                <p>
                                    {chapter
                                        ? `Installation distance: ${formatKilometres(chapter.metres)} km`
                                        : 'Installation usage unavailable'}
                                </p>
                                {chapter && (
                                    <p>
                                        {chapter.hasUnknownDuration
                                            ? 'Installation duration incomplete; known duration: '
                                            : 'Installation duration: '}
                                        {formatDuration(chapter.seconds)}
                                    </p>
                                )}
                            </article>
                        );
                    })}
                    <details>
                        <summary>Technical details</summary>
                        <p>Component ID: {c.id}</p>
                    </details>
                </>
            )}
            <h3>Service history</h3>
            <p>Includes service done while it was on other bikes.</p>
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
            {services.map((m) => (
                <article key={m.id}>
                    <h4>{m.task}</h4>
                    <BikeIdentity bikeId={m.bikeId} />
                    <p>
                        {formatDateTime(m.performedUtc)} ·{' '}
                        {m.cost === null
                            ? 'Cost unknown'
                            : m.currency === 'EUR'
                              ? formatEuroCost(m.cost)
                              : `${m.cost} ${m.currency ?? 'currency unknown'}`}
                    </p>
                    {m.notes && <p>{m.notes}</p>}
                </article>
            ))}
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
            <button onClick={onClose}>Close</button>
        </Dialog>
    );
}
