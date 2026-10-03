'use client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/query';
import { useEffect, useState } from 'react';
import type {
    InstallationResponse,
    Position,
    Validated,
} from '@bikelog/api-client';
import { useComponentPages, useInstallationPages } from './queries';
import { formatDateTime } from '../../lib/dates';
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
            <p className="dialog-description">
                Lifetime mileage stays with the component.
                <br />
                Open a component to see calculated usage and installation
                history.
            </p>
            <button
                aria-pressed={status === 'current'}
                disabled={switching}
                onClick={() => void selectFilter('current')}
            >
                Current installations
            </button>
            <button
                aria-pressed={status === 'all'}
                disabled={switching}
                onClick={() => void selectFilter('all')}
            >
                All installations
            </button>
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
                            <th>Position</th>
                            <th>Chapter</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ installation: i, component: c }) => (
                            <tr key={i.id}>
                                <td>
                                    <button
                                        disabled={disabled}
                                        onClick={() => onPassport?.(c.id)}
                                    >
                                        {c.make}{' '}
                                        {c.model?.trim() ||
                                            'Model not provided'}
                                    </button>
                                </td>
                                <td>{i.position}</td>
                                <td>
                                    {formatDateTime(i.startUtc)} —{' '}
                                    {i.endUtc
                                        ? formatDateTime(i.endUtc)
                                        : 'Open-ended'}
                                    {currentRows.some(
                                        (r) => r.installation.id === i.id,
                                    ) && <span> Currently fitted</span>}
                                </td>
                                <td>
                                    {onReplace &&
                                        currentRows.some(
                                            (r) => r.installation.id === i.id,
                                        ) && (
                                            <button
                                                disabled={disabled}
                                                onClick={() => onReplace(i)}
                                            >
                                                Replace
                                            </button>
                                        )}
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
                        <p key={p}>
                            {p}: vacant{' '}
                            {onFit && (
                                <button
                                    disabled={disabled}
                                    onClick={() => onFit(p)}
                                >
                                    Fit {p}
                                </button>
                            )}
                        </p>
                    ))}
            <h3>Owner-wide component collection</h3>
            <p>
                Retained parts remain available after removal. Open a passport
                to inspect every dated chapter.
            </p>
            {collection.isError && (
                <button onClick={() => void collection.refetch()}>
                    Retry collection
                </button>
            )}
            {parts.map((c) => (
                <article key={c.id}>
                    <button
                        disabled={disabled}
                        onClick={() => onPassport?.(c.id)}
                    >
                        {c.make} {c.model?.trim() || 'Model not provided'}
                    </button>
                    {c.installations.length === 0 && <span> Never fitted</span>}
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
        </section>
    );
}
