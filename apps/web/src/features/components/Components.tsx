'use client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query';
import { useEffect, useState } from 'react';
import type {
    InstallationResponse,
    Position,
    Validated,
} from '@bikelog/api-client';
import {
    useComponentPages,
    useInstallationPages,
    useComponentUsage,
} from './queries';
import { formatKilometres } from '../../lib/format';
function Lifetime({ componentId }: { componentId: string }) {
    const usage = useComponentUsage(componentId);
    return (
        <>
            {usage.data ? (
                <>
                    {formatKilometres(usage.data.combinedLifetimeMetres)} km
                    {usage.data.initialUsageEstimateMetres > 0 && (
                        <small className="estimate-label">
                            Includes estimate
                        </small>
                    )}
                </>
            ) : usage.isError ? (
                <button
                    className="text-button"
                    onClick={() => void usage.refetch()}
                >
                    Retry usage
                </button>
            ) : (
                'Loading…'
            )}
        </>
    );
}
export type ComponentsProps = {
    bikeId: string;
    disabled?: boolean;
    onPassport?: (componentId: string) => void;
    onReplace?: (installation: Validated<InstallationResponse>) => void;
    onFit?: (position: Position) => void;
};
export function Components({
    bikeId,
    disabled,
    onPassport,
    onReplace,
    onFit,
}: ComponentsProps) {
    const client = useQueryClient();
    const [switching, setSwitching] = useState(false);
    const [status, setStatus] = useState<'current' | 'all'>('current');
    async function selectFilter(next: 'current' | 'all') {
        if (next === status || switching) return;
        setSwitching(true);
        const queryKey = queryKeys.installations(bikeId, next);
        await client.cancelQueries({ queryKey, exact: true });
        // Reset synchronously discards every page/cursor before mounting the next observer.
        void client.resetQueries({ queryKey, exact: true });
        setStatus(next);
        setSwitching(false);
    }
    const chapters = useInstallationPages(bikeId, status);
    const current = useInstallationPages(bikeId, 'current');
    const collection = useComponentPages();
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
    const currentRows = current.data?.pages.flatMap((p) => p.items) ?? [];
    const rows = [
        ...new Map(
            (chapters.data?.pages.flatMap((p) => p.items) ?? []).map((row) => [
                row.installation.id,
                row,
            ]),
        ).values(),
    ];
    const parts = [
        ...new Map(
            (collection.data?.pages.flatMap((p) => p.items) ?? []).map(
                (part) => [part.id, part],
            ),
        ).values(),
    ];
    return (
        <section className="card table-card component-card">
            <div className="card-title">
                <h2>Component collection</h2>
            </div>
            <div className="section-intro">
                <p>
                    Lifetime mileage stays with the component.
                    <br />
                    Open a component to see calculated usage and installation
                    history.
                </p>
                <select
                    className="filter"
                    aria-label="Filter components"
                    value={status}
                    disabled={switching}
                    onChange={(e) =>
                        void selectFilter(e.target.value as 'current' | 'all')
                    }
                >
                    <option value="current">Currently fitted</option>
                    <option value="all">Include replaced parts</option>
                </select>
            </div>
            {chapters.isPending && <p>Loading installations…</p>}
            {chapters.isError && (
                <p role="alert">
                    Unable to load installations.{' '}
                    <button onClick={() => void chapters.refetch()}>
                        Retry installations
                    </button>
                </p>
            )}
            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Component</th>
                            <th>Lifetime</th>
                            <th>Status</th>
                            <th>
                                <span className="visually-hidden">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ installation: i, component: c }) => (
                            <tr key={i.id}>
                                <td>
                                    <div className="item-name">
                                        <span
                                            className="part-icon"
                                            aria-hidden="true"
                                        >
                                            {i.position === 'chain'
                                                ? '⌁'
                                                : i.position === 'cassette'
                                                  ? '⚙'
                                                  : '◯'}
                                        </span>
                                        <span>
                                            <strong className="position-label">
                                                {i.position.replaceAll(
                                                    '-',
                                                    ' ',
                                                )}
                                            </strong>
                                            <button
                                                className="text-button component-name"
                                                disabled={disabled}
                                                onClick={() =>
                                                    onPassport?.(c.id)
                                                }
                                            >
                                                {c.make}{' '}
                                                {c.model?.trim() ||
                                                    'Model not provided'}
                                            </button>
                                        </span>
                                    </div>
                                </td>
                                <td className="number">
                                    <Lifetime componentId={c.id} />
                                </td>
                                <td>
                                    <span
                                        className={`status ${currentRows.some((r) => r.installation.id === i.id) ? 'green' : 'gray'}`}
                                    >
                                        {currentRows.some(
                                            (r) => r.installation.id === i.id,
                                        )
                                            ? 'Fitted'
                                            : 'Archived'}
                                    </span>
                                </td>
                                <td>
                                    <div className="component-actions">
                                        {onReplace &&
                                            currentRows.some(
                                                (r) =>
                                                    r.installation.id === i.id,
                                            ) && (
                                                <button
                                                    className="text-button"
                                                    disabled={disabled}
                                                    onClick={() => onReplace(i)}
                                                >
                                                    Replace
                                                </button>
                                            )}
                                        <button
                                            className="row-button"
                                            disabled={disabled || !onPassport}
                                            onClick={() => onPassport?.(c.id)}
                                            aria-label={`View ${i.position.replaceAll('-', ' ')} history`}
                                        >
                                            ↗
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {chapters.hasNextPage && (
                <button
                    disabled={chapters.isFetchingNextPage}
                    onClick={() => void chapters.fetchNextPage()}
                >
                    Load more installations
                </button>
            )}
            {current.isSuccess &&
                !current.hasNextPage &&
                (['chain', 'cassette', 'front-tyre', 'rear-tyre'] as Position[])
                    .filter(
                        (p) =>
                            !currentRows.some(
                                (r) => r.installation.position === p,
                            ),
                    )
                    .map((p) => (
                        <p className="vacant-position" key={p}>
                            {p}: vacant{' '}
                            {onFit && (
                                <button
                                    className="button secondary"
                                    disabled={disabled}
                                    onClick={() => onFit(p)}
                                >
                                    Fit {p}
                                </button>
                            )}
                        </p>
                    ))}
            <details className="component-library">
                <summary>Other parts in your garage</summary>
                <p>
                    Retained parts remain available after removal. Open a
                    passport to inspect every dated chapter.
                </p>
                {collection.isError && (
                    <button onClick={() => void collection.refetch()}>
                        Retry collection
                    </button>
                )}
                {parts
                    .filter(
                        (c) => !rows.some((row) => row.component.id === c.id),
                    )
                    .map((c) => (
                        <article key={c.id}>
                            <button
                                disabled={disabled}
                                onClick={() => onPassport?.(c.id)}
                            >
                                {c.make}{' '}
                                {c.model?.trim() || 'Model not provided'}
                            </button>
                            {c.installations.length === 0 && (
                                <span> Never fitted</span>
                            )}
                        </article>
                    ))}
                {collection.hasNextPage && (
                    <button
                        disabled={collection.isFetchingNextPage}
                        onClick={() => void collection.fetchNextPage()}
                    >
                        Load more components
                    </button>
                )}
            </details>
        </section>
    );
}
