'use client';
import { useEffect, useState } from 'react';
import type {
    BikeResponse,
    BikeStatus,
    Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { FormError } from '../../components/FormError';
import { ConflictPanel } from '../../components/ConflictPanel';
import { errorText } from '../../lib/errors';
import { getApi } from '../../lib/api';
import { useSetBikeStatus } from './mutations';
export type RetireBikeProps = {
    bike: Validated<BikeResponse>;
    onSaved: (bike: Validated<BikeResponse>) => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onBusyChange?: (busy: boolean) => void;
};
function StatusSummary({ bike }: { bike: Validated<BikeResponse> }) {
    return (
        <p>
            {bike.displayName} is{' '}
            {bike.status === 'retired' ? 'retired' : 'active'} (version{' '}
            {bike.version}).
        </p>
    );
}
/** Confirms retiring an active bike, or reactivating a retired one. */
export function RetireBikeDialog({
    bike,
    onSaved,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: RetireBikeProps) {
    const [original] = useState(bike);
    const status: BikeStatus =
        original.status === 'retired' ? 'active' : 'retired';
    const save = useSetBikeStatus();
    const busy = save.state.phase === 'saving' || save.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(save.state.phase);
    useEffect(() => {
        onDirtyChange?.(recovery);
    }, [recovery, onDirtyChange]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    const current = save.state.current as Validated<BikeResponse> | undefined;
    const cancel = () => {
        if (!busy) onCancel();
    };
    function finish(result: Validated<BikeResponse> | undefined) {
        if (!result) return;
        onDirtyChange?.(false);
        onBusyChange?.(false);
        onSaved(result);
    }
    async function refresh() {
        await save.refreshCurrent(() => getApi().getBike(original.id));
    }
    async function submit() {
        const result = await save.submit({
            bikeId: original.id,
            status,
            expectedVersion: original.version,
        });
        if (save.getState().phase === 'conflict') await refresh();
        finish(result);
    }
    async function retry() {
        if (!current) return;
        const next = {
            bikeId: original.id,
            status,
            expectedVersion: current.version,
        };
        const result = await (save.state.phase === 'conflict'
            ? save.reapply(next)
            : save.resubmit(next));
        if (save.getState().phase === 'conflict') await refresh();
        finish(result);
    }
    const retiring = status === 'retired';
    return (
        <Dialog
            open
            title={`${retiring ? 'Retire' : 'Reactivate'} ${original.displayName}?`}
            onCancel={cancel}
        >
            {retiring ? (
                <p>
                    A retired bike keeps its rides, parts and history, and you
                    can reactivate it at any time. It is not offered for new
                    rides or parts, and its chain reminder pauses.
                </p>
            ) : (
                <p>
                    The bike is offered for rides and parts again, and its chain
                    reminder resumes.
                </p>
            )}
            <FormError
                errors={[
                    ...(save.state.error && save.state.phase === 'validation'
                        ? [errorText(save.state.error)]
                        : []),
                    ...(save.state.refreshError
                        ? [save.state.refreshError.message]
                        : []),
                ]}
            />
            <div className="dialog-actions">
                <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={cancel}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="button primary"
                    disabled={busy || recovery}
                    onClick={() => void submit()}
                >
                    {retiring ? 'Retire bike' : 'Reactivate bike'}
                </button>
            </div>
            {save.state.phase === 'conflict' && save.state.refreshed && current && !busy && (
                <ConflictPanel
                    attempted={
                        <p>
                            {retiring ? 'Retire' : 'Reactivate'} version{' '}
                            {original.version}
                        </p>
                    }
                    current={<StatusSummary bike={current} />}
                    onReapply={() => void retry()}
                    onCancel={cancel}
                />
            )}
            {save.state.phase === 'uncertain' && (
                <section aria-label="Uncertain save">
                    <p>
                        The outcome is uncertain. Refresh to see the bike’s
                        current status before trying again.
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void refresh()}
                    >
                        Refresh saved data
                    </button>
                    {save.state.refreshed && current && (
                        <>
                            <StatusSummary bike={current} />
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void retry()}
                            >
                                Try again
                            </button>
                        </>
                    )}
                </section>
            )}
        </Dialog>
    );
}
