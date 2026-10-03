import type { ReactNode } from 'react';
import { ConflictPanel } from '../../components/ConflictPanel';
type Props = {
    phase: string;
    refreshed: boolean;
    busy: boolean;
    current: ReactNode;
    attempted: ReactNode;
    canRetry: boolean;
    onRefresh: () => void;
    onRetry: () => void;
    onCancel: () => void;
    onLoadMore?: () => void;
};
export function RideRecovery({
    phase,
    refreshed,
    busy,
    current,
    attempted,
    canRetry,
    onRefresh,
    onRetry,
    onCancel,
    onLoadMore,
}: Props) {
    if (phase !== 'conflict' && phase !== 'uncertain') return null;
    return (
        <>
            {phase === 'conflict' && refreshed && canRetry && !busy && (
                <ConflictPanel
                    attempted={attempted}
                    current={current}
                    onReapply={onRetry}
                    onCancel={onCancel}
                />
            )}
            {phase === 'uncertain' && (
                <section aria-label="Uncertain save">
                    <p>
                        The write outcome is uncertain. Refresh saved data and
                        check the record or history before explicitly
                        resubmitting. Creating again may duplicate a ride.
                    </p>
                </section>
            )}
            <button type="button" disabled={busy} onClick={onRefresh}>
                Refresh saved data
            </button>
            {refreshed && (phase === 'uncertain' || !canRetry) && (
                <section aria-label="Current saved data">
                    <h3>Current saved data</h3>
                    {current}
                </section>
            )}
            {onLoadMore && (
                <button type="button" disabled={busy} onClick={onLoadMore}>
                    Load more saved rides
                </button>
            )}
            {phase === 'uncertain' && (
                <button
                    type="button"
                    disabled={busy || !refreshed || !canRetry}
                    onClick={onRetry}
                >
                    Resubmit after review
                </button>
            )}
        </>
    );
}
