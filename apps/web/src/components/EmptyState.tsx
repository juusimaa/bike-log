import type { ReactNode } from 'react';
export function EmptyState({
    title,
    children,
}: {
    title: string;
    children?: ReactNode;
}) {
    return (
        <section className="card empty">
            <h2>{title}</h2>
            {children}
        </section>
    );
}
export function ReadError({
    error,
    onRetry,
}: {
    error: Error;
    onRetry: () => void;
}) {
    return (
        <section className="card empty" role="alert">
            <h2>
                {error.name === 'ClientRangeError'
                    ? 'Client range error'
                    : 'Data unavailable'}
            </h2>
            <p>{error.message}</p>
            <button className="button secondary" onClick={onRetry}>
                Retry
            </button>
        </section>
    );
}
