'use client';
import { useEffect, useState } from 'react';
import {
    ApiError,
    type ComponentResponse,
    type Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { FormError } from '../../components/FormError';
import { ConflictPanel } from '../../components/ConflictPanel';
import { errorText } from '../../lib/errors';
import { getApi } from '../../lib/api';
import { useDeleteComponent } from './mutations';
import { useComponentCatalog, positionLabel } from './catalog';
export type DeleteComponentProps = {
    component: Validated<ComponentResponse>;
    onDeleted: () => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onBusyChange?: (busy: boolean) => void;
};
/** Permanent deletion of a spare or fitted part, naming where it is fitted. */
export function DeleteComponentDialog({
    component,
    onDeleted,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: DeleteComponentProps) {
    const [original] = useState(component);
    const catalog = useComponentCatalog().data;
    const remove = useDeleteComponent();
    const busy = remove.state.phase === 'saving' || remove.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(remove.state.phase);
    useEffect(() => {
        onDirtyChange?.(recovery);
    }, [recovery, onDirtyChange]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    const current = remove.state.current as
        | { record?: Validated<ComponentResponse>; missing?: boolean }
        | undefined;
    const open = original.installations.find((i) => i.endUtc === null);
    const fittedTo = open
        ? original.bikes.find((b) => b.id === open.bikeId)
        : undefined;
    const name = `${original.make} ${original.model}`;
    const affectedBikeIds = [
        ...new Set(original.installations.map((i) => i.bikeId)),
    ];
    const cancel = () => {
        if (!busy) onCancel();
    };
    async function refresh() {
        await remove.refreshCurrent(async () => {
            try {
                return {
                    record: await getApi().getComponent(original.id),
                };
            } catch (error) {
                if (error instanceof ApiError && error.status === 404)
                    return { missing: true };
                throw error;
            }
        });
    }
    async function finish() {
        if (remove.getState().phase === 'saved') {
            onDirtyChange?.(false);
            onBusyChange?.(false);
            onDeleted();
        } else if (remove.getState().phase === 'conflict') await refresh();
    }
    async function submit() {
        await remove.submit({
            componentId: original.id,
            expectedVersion: original.version,
            affectedBikeIds,
        });
        await finish();
    }
    async function retry() {
        if (!current?.record || !remove.state.attempted) return;
        const next = {
            ...remove.state.attempted,
            expectedVersion: current.record.version,
        };
        if (remove.state.phase === 'conflict') await remove.reapply(next);
        else await remove.resubmit(next);
        await finish();
    }
    return (
        <Dialog open title={`Delete ${name}?`} onCancel={cancel}>
            {open && (
                <p>
                    It is fitted to{' '}
                    <strong>{fittedTo?.displayName ?? 'a bike'}</strong> as the{' '}
                    {positionLabel(catalog, open.position).toLowerCase()}. That
                    position will be empty.
                </p>
            )}
            <p>
                This permanently deletes the part with its fitting history and
                usage. Rides on those dates will show a gap for its position.
                Maintenance records that name it are kept without the part.
            </p>
            <p className="danger-note">This cannot be undone.</p>
            <FormError
                errors={[
                    ...(remove.state.error && remove.state.phase === 'validation'
                        ? [errorText(remove.state.error)]
                        : []),
                    ...(remove.state.refreshError
                        ? [remove.state.refreshError.message]
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
                    className="button danger"
                    disabled={busy || recovery}
                    onClick={() => void submit()}
                >
                    Delete part
                </button>
            </div>
            {remove.state.phase === 'conflict' &&
                remove.state.refreshed &&
                current?.record &&
                !busy && (
                    <ConflictPanel
                        attempted={<p>Delete version {original.version}</p>}
                        current={
                            <p>
                                {current.record.make} {current.record.model}{' '}
                                (version {current.record.version})
                            </p>
                        }
                        onReapply={() => void retry()}
                        onCancel={cancel}
                    />
                )}
            {remove.state.phase === 'uncertain' && (
                <section aria-label="Uncertain save">
                    <p>
                        The outcome is uncertain. Refresh to check whether the
                        part still exists before trying again.
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void refresh()}
                    >
                        Refresh saved data
                    </button>
                    {remove.state.refreshed && current?.missing && (
                        <p>The part has been deleted. Close this dialog.</p>
                    )}
                    {remove.state.refreshed && current?.record && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void retry()}
                        >
                            Try again
                        </button>
                    )}
                </section>
            )}
        </Dialog>
    );
}
