import { readErrorCopy } from '../lib/errors';
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
    retrying = false,
}: {
    error: Error;
    onRetry: () => void;
    retrying?: boolean;
}) {
    const copy = readErrorCopy(error);
    return (
        <section className="card empty" role="alert">
            <h2>{copy.title}</h2>
            <p>{copy.body}</p>
            <button
                type="button"
                className="button secondary"
                disabled={retrying}
                onClick={onRetry}
            >
                {retrying ? 'Retrying…' : 'Retry'}
            </button>
        </section>
    );
}
