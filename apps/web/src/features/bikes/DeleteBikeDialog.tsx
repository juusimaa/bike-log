'use client';
import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError, type BikeResponse, type Validated } from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { FormError } from '../../components/FormError';
import { errorText } from '../../lib/errors';
import { getApi } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import {
    useComponentCatalog,
    positionLabel,
    typeLabel,
    capitalised,
} from '../components/catalog';
export type DeleteBikeProps = {
    bike: Validated<BikeResponse>;
    onDeleted: (bikeId: string) => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onBusyChange?: (busy: boolean) => void;
};
function count(n: number, one: string, many = `${one}s`) {
    return `${n} ${n === 1 ? one : many}`;
}
/**
 * Deletes a bike in one request. Every fitted part is listed unticked; ticked parts are kept
 * as spares. The server rejects the request if the fitted parts changed since this list.
 */
export function DeleteBikeDialog({
    bike,
    onDeleted,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: DeleteBikeProps) {
    const [original] = useState(bike);
    const prefix = useId();
    const catalog = useComponentCatalog().data;
    const preview = useQuery({
        queryKey: queryKeys.deletionPreview(original.id),
        queryFn: ({ signal }) =>
            getApi().getBikeDeletionPreview(original.id, signal),
        staleTime: 0,
        gcTime: 0,
    });
    const [keep, setKeep] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [changed, setChanged] = useState(false);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    useEffect(() => {
        onDirtyChange?.(keep.size > 0);
    }, [keep, onDirtyChange]);
    const p = preview.data;
    const parts = p?.fittedParts ?? [];
    // Ticks follow components, so a refreshed list keeps the choices still possible.
    const kept = parts.filter((x) => keep.has(x.componentId));
    const cancel = () => {
        if (!busy) onCancel();
    };
    function toggle(componentId: string, on: boolean) {
        const next = new Set(keep);
        if (on) next.add(componentId);
        else next.delete(componentId);
        setKeep(next);
    }
    async function submit() {
        if (!p) return;
        setBusy(true);
        setError(null);
        setChanged(false);
        try {
            await getApi().deleteBike(original.id, {
                expectedVersion: p.bikeVersion,
                fittedInstallationIds: parts.map((x) => x.installationId),
                keepComponentIds: [
                    ...new Set(kept.map((x) => x.componentId)),
                ],
            });
            onDirtyChange?.(false);
            onBusyChange?.(false);
            onDeleted(original.id);
        } catch (cause) {
            if (
                cause instanceof ApiError &&
                (cause.code === 'bike_parts_changed' ||
                    cause.code === 'stale_version')
            ) {
                setChanged(true);
                await preview.refetch();
            } else if (cause instanceof ApiError && cause.uncertain) {
                setError(
                    'The outcome is uncertain. Close this dialog and check your garage before trying again.',
                );
            } else setError(errorText(cause));
        } finally {
            setBusy(false);
        }
    }
    return (
        <Dialog
            open
            wide
            title={`Delete ${original.displayName}?`}
            onCancel={cancel}
        >
            {preview.isPending && <p role="status">Loading the bike’s parts…</p>}
            {preview.isError && (
                <p role="alert">
                    {errorText(preview.error)}{' '}
                    <button
                        type="button"
                        className="button small secondary"
                        onClick={() => void preview.refetch()}
                    >
                        Retry
                    </button>
                </p>
            )}
            {p && (
                <>
                    {changed && (
                        <div className="notice inline" role="status">
                            <p>
                                This bike changed since you opened this dialog.
                                Review the parts below and confirm again.
                            </p>
                        </div>
                    )}
                    <p>
                        {count(p.rideCount, 'ride')} stay in All rides under
                        this bike’s name. Its{' '}
                        {count(p.maintenanceCount, 'maintenance record')}, chain
                        reminder and position settings are deleted.
                    </p>
                    {parts.length > 0 ? (
                        <fieldset className="keep-parts" disabled={busy}>
                            <legend>
                                Tick the parts to keep as spares. Unticked parts
                                are deleted with their history.
                            </legend>
                            {parts.map((part) => {
                                const id = `${prefix}-${part.installationId}`;
                                return (
                                    <label key={part.installationId} htmlFor={id}>
                                        <input
                                            id={id}
                                            type="checkbox"
                                            checked={keep.has(part.componentId)}
                                            onChange={(event) =>
                                                toggle(
                                                    part.componentId,
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                        <span>
                                            <strong>
                                                {capitalised(
                                                    typeLabel(catalog, part.type),
                                                )}
                                            </strong>{' '}
                                            {part.make} {part.model}
                                            <small>
                                                {positionLabel(
                                                    catalog,
                                                    part.position,
                                                )}
                                            </small>
                                        </span>
                                    </label>
                                );
                            })}
                        </fieldset>
                    ) : (
                        <p>No parts are fitted to this bike.</p>
                    )}
                    <p className="danger-note">This cannot be undone.</p>
                </>
            )}
            <FormError errors={error ? [error] : []} />
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
                    disabled={busy || !p || preview.isFetching}
                    onClick={() => void submit()}
                >
                    {kept.length
                        ? `Delete bike, keep ${count(kept.length, 'part')}`
                        : 'Delete bike'}
                </button>
            </div>
        </Dialog>
    );
}
