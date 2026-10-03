'use client';
import { useEffect } from 'react';
import type { ComponentResponse, Validated } from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { usePassport, useInstallationPages } from './queries';
import { BikeIdentity } from './BikeIdentity';
import { formatDateTime } from '../../lib/dates';
import {
    formatKilometres,
    formatDuration,
    formatEuroCost,
} from '../../lib/format';
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
    return (
        <span>
            {fitted
                ? 'Currently fitted'
                : current.isSuccess && !current.hasNextPage
                  ? 'Not currently fitted'
                  : 'Current status unavailable'}
            {current.isError && (
                <button onClick={() => void current.refetch()}>
                    Retry current status
                </button>
            )}
        </span>
    );
}
export function ComponentPassport({
    componentId,
    selectedBikeId,
    onClose,
    onEditEstimate,
}: {
    componentId: string;
    selectedBikeId: string;
    onClose: () => void;
    onEditEstimate?: (component: Validated<ComponentResponse>) => void;
}) {
    const { detail, usage, maintenance } = usePassport(componentId);
    const c = detail.data,
        u = usage.data;
    return (
        <Dialog
            open
            title={
                c
                    ? `${c.model ?? 'Model not provided'} passport`
                    : 'Component passport'
            }
            onCancel={onClose}
        >
            {detail.isPending && <p>Loading component…</p>}
            {detail.isError && (
                <p role="alert">
                    Unable to load component.{' '}
                    <button onClick={() => void detail.refetch()}>
                        Retry component
                    </button>
                </p>
            )}
            {c && (
                <>
                    <p>Component identity: {c.id}</p>
                    <p>Type: {c.type}</p>
                    <p>
                        Starting estimate:{' '}
                        {formatKilometres(c.initialUsageEstimateMetres)} km
                    </p>
                    {onEditEstimate && (
                        <button onClick={() => onEditEstimate(c)}>
                            Edit starting estimate
                        </button>
                    )}
                    {c.installations.length === 0 && (
                        <p>Never fitted. No installation chapters.</p>
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
                        <button onClick={() => void usage.refetch()}>
                            Retry usage
                        </button>
                    )}
                    <h3>All dated installation chapters</h3>
                    {c.installations.map((i) => {
                        const chapter = u?.installations.find(
                            (x) => x.installation.id === i.id,
                        );
                        return (
                            <article key={i.id}>
                                <BikeIdentity bikeId={i.bikeId} />
                                <p>
                                    {i.position} · {formatDateTime(i.startUtc)}{' '}
                                    —{' '}
                                    {i.endUtc
                                        ? formatDateTime(i.endUtc)
                                        : 'Open-ended'}
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
                </>
            )}
            <h3>Owner-wide maintenance history</h3>
            <p>
                Includes service on bikes other than the selected bike (
                {selectedBikeId}).
            </p>
            {maintenance.isError && (
                <button onClick={() => void maintenance.refetch()}>
                    Retry component maintenance
                </button>
            )}
            {[
                ...new Map(
                    (maintenance.data?.pages.flatMap((p) => p.items) ?? []).map(
                        (m) => [m.id, m],
                    ),
                ).values(),
            ].map((m) => (
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
                    Load more component maintenance
                </button>
            )}
            <button onClick={onClose}>Close passport</button>
        </Dialog>
    );
}
