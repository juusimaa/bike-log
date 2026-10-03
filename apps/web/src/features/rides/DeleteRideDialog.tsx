'use client';
import { useEffect, useState } from 'react';
import {
    ApiError,
    type RideResponse,
    type Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { FormError } from '../../components/FormError';
import { getApi } from '../../lib/api';
import { useRideMutations } from './mutations';
import { RideSummary } from './RideSummary';
import { RideRecovery } from './RideRecovery';
export type DeleteRideProps = {
    ride: Validated<RideResponse>;
    onDeleted: () => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onBusyChange?: (busy: boolean) => void;
};
export function DeleteRideDialog({
    ride,
    onDeleted,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: DeleteRideProps) {
    const [original] = useState(ride);
    const { remove } = useRideMutations(original.bikeId);
    const busy = remove.state.phase === 'saving' || remove.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(remove.state.phase);
    useEffect(() => {
        onDirtyChange?.(recovery);
    }, [recovery, onDirtyChange]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    const current = remove.state.current as
        { record?: Validated<RideResponse>; missing?: boolean } | undefined;
    const cancel = () => {
        if (!busy) onCancel();
    };
    async function refresh() {
        await remove.refreshCurrent(async () => {
            try {
                return { record: await getApi().getRide(original.id) };
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
            rideId: original.id,
            expectedVersion: original.version,
        });
        await finish();
    }
    async function retry() {
        if (!current?.record || !remove.state.attempted) return;
        const next = {
            ...remove.state.attempted,
            expectedVersion: current.record.version,
            affectedBikeIds: [current.record.bikeId],
        };
        if (remove.state.phase === 'conflict') await remove.reapply(next);
        else await remove.resubmit(next);
        await finish();
    }
    return (
        <Dialog open title="Delete ride?" onCancel={cancel}>
            <p>
                Delete this ride? The server will update recorded usage and
                reminders.
            </p>
            <RideSummary ride={original} />
            <FormError
                errors={[
                    ...(remove.state.error ? [remove.state.error.message] : []),
                    ...(remove.state.refreshError
                        ? [remove.state.refreshError.message]
                        : []),
                ]}
            />
            <button
                className="button primary"
                disabled={busy || recovery}
                onClick={() => void submit()}
            >
                Delete ride
            </button>
            <button disabled={busy} onClick={cancel}>
                Cancel
            </button>
            <RideRecovery
                phase={remove.state.phase}
                refreshed={remove.state.refreshed}
                busy={busy}
                current={
                    current?.record ? (
                        <RideSummary ride={current.record} />
                    ) : (
                        <p>
                            This ride no longer exists. Close and refresh
                            history; the original write outcome remains
                            uncertain.
                        </p>
                    )
                }
                attempted={
                    <>
                        <p>Delete selected version {original.version}</p>
                        <RideSummary ride={original} />
                    </>
                }
                canRetry={!!current?.record}
                onRefresh={() => void refresh()}
                onRetry={() => void retry()}
                onCancel={cancel}
            />
        </Dialog>
    );
}
