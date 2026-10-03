'use client';
import { useEffect, useId, useState } from 'react';
import {
    ApiError,
    type RideResponse,
    type Validated,
    type PageResponseOfRideResponse,
    type CreateRide,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { FormError } from '../../components/FormError';
import {
    formatLocal,
    validOffsets,
    preserveOrConvertInstant,
} from '../../lib/dates';
import { parseKilometres, parseMinutes } from '../../lib/units';
import { getApi } from '../../lib/api';
import { useRideMutations, type RideSave } from './mutations';
import { RideSummary } from './RideSummary';
import { RideRecovery } from './RideRecovery';
import { RideFields } from './RideFields';
export type RideFormProps = {
    bikeId: string;
    ride?: Validated<RideResponse>;
    onSaved: (ride: Validated<RideResponse>) => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onBusyChange?: (busy: boolean) => void;
};
export function RideForm({
    bikeId,
    ride,
    onSaved,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: RideFormProps) {
    const [original] = useState(() => ({ bikeId, ride }));
    const [initial] = useState(() => ({
        name: ride?.name ?? '',
        start: ride
            ? formatLocal(ride.startUtc)
            : formatLocal(new Date().toISOString()),
        distance: ride
            ? `${Math.floor(ride.distanceMetres / 1000)}.${String(ride.distanceMetres % 1000).padStart(3, '0')}`
            : '',
        duration:
            ride?.durationSeconds != null && ride.durationSeconds % 60 === 0
                ? String(ride.durationSeconds / 60)
                : '',
        offset: '',
    }));
    const [values, setValues] = useState(initial);
    const [durationEdited, setDurationEdited] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<string[]>([]);
    const [attemptCount, setAttemptCount] = useState(0);
    const prefix = useId();
    const { save } = useRideMutations(original.bikeId);
    const busy = save.state.phase === 'saving' || save.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(save.state.phase);
    const dirty =
        JSON.stringify(values) !== JSON.stringify(initial) ||
        durationEdited ||
        recovery;
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    let offsets: string[] = [];
    try {
        offsets = validOffsets(values.start);
    } catch {
        /* Submit presents date validation. */
    }
    const current = save.state.current as
        | {
              record?: Validated<RideResponse>;
              page?: Validated<PageResponseOfRideResponse>;
              missing?: boolean;
          }
        | undefined;
    const cancel = () => {
        if (!busy) onCancel();
    };
    function payload(): RideSave | undefined {
        setAttemptCount((n) => n + 1);
        let field = 'name';
        setFieldErrors({});
        try {
            if (values.name.trim().length > 100)
                throw new Error('Ride name must be at most 100 characters.');
            field = 'start';
            const startUtc = preserveOrConvertInstant(
                original.ride?.startUtc,
                original.ride ? initial.start : undefined,
                values.start,
                values.offset || undefined,
            );
            field = 'distance';
            const distanceMetres = parseKilometres(values.distance, false);
            field = 'duration';
            const durationSeconds =
                original.ride && !durationEdited
                    ? original.ride.durationSeconds
                    : parseMinutes(values.duration);
            const input: CreateRide = {
                bikeId: original.bikeId,
                startUtc,
                distanceMetres,
                durationSeconds,
                name: values.name.trim() || null,
            };
            setErrors([]);
            return {
                rideId: original.ride?.id,
                input: original.ride
                    ? { ...input, expectedVersion: original.ride.version }
                    : input,
            };
        } catch (error) {
            setFieldErrors({
                [field]:
                    error instanceof Error
                        ? error.message
                        : 'Check ride values.',
            });
            setErrors([
                error instanceof Error ? error.message : 'Check ride values.',
            ]);
        }
    }
    async function refresh() {
        await save.refreshCurrent(async () => {
            if (!original.ride)
                return {
                    page: await getApi().listRides(original.bikeId, {
                        pageSize: 50,
                    }),
                };
            try {
                return { record: await getApi().getRide(original.ride.id) };
            } catch (error) {
                if (error instanceof ApiError && error.status === 404)
                    return { missing: true };
                throw error;
            }
        });
    }
    async function loadMore() {
        const page = current?.page;
        if (!page?.nextCursor) return;
        await save.refreshCurrent(async () => {
            const next = await getApi().listRides(original.bikeId, {
                pageSize: 50,
                cursor: page.nextCursor!,
            });
            return {
                page: {
                    ...next,
                    items: [
                        ...new Map(
                            [...page.items, ...next.items].map((item) => [
                                item.id,
                                item,
                            ]),
                        ).values(),
                    ],
                },
            };
        });
    }
    async function finish(result: Validated<RideResponse> | undefined) {
        if (result) {
            onDirtyChange?.(false);
            onBusyChange?.(false);
            onSaved(result);
        }
    }
    async function submit() {
        const attempt = payload();
        if (!attempt) return;
        const result = await save.submit(attempt);
        if (save.getState().phase === 'conflict') await refresh();
        await finish(result);
    }
    async function retry() {
        const attempt = save.state.attempted;
        if (!attempt) return;
        const fresh = current?.record;
        const next: RideSave = fresh
            ? {
                  ...attempt,
                  input: { ...attempt.input, expectedVersion: fresh.version },
                  affectedBikeIds: [fresh.bikeId],
              }
            : attempt;
        const result = await (save.state.phase === 'conflict'
            ? save.reapply(next)
            : save.resubmit(next));
        if (save.getState().phase === 'conflict') await refresh();
        await finish(result);
    }
    const currentSummary = (
        <>
            {current?.record && <RideSummary ride={current.record} />}
            {current?.missing && (
                <p>This ride no longer exists. Close and refresh history.</p>
            )}
            {current?.page && (
                <>
                    {current.page.items.map((item) => (
                        <RideSummary key={item.id} ride={item} />
                    ))}
                    {current.page.items.length === 0 && (
                        <p>No rides on this page.</p>
                    )}
                    {current.page.nextCursor && (
                        <p>
                            More rides exist. Check the next page before
                            creating again.
                        </p>
                    )}
                </>
            )}
        </>
    );
    return (
        <Dialog
            open
            title={original.ride ? 'Correct ride' : 'Log ride'}
            onCancel={cancel}
        >
            <form
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!busy && !recovery) void submit();
                }}
            >
                <FormError
                    key={attemptCount}
                    errors={[
                        ...errors,
                        ...(save.state.error ? [save.state.error.message] : []),
                        ...(save.state.refreshError
                            ? [save.state.refreshError.message]
                            : []),
                    ]}
                />
                <fieldset disabled={busy || recovery}>
                    <RideFields
                        prefix={prefix}
                        errors={fieldErrors}
                        values={values}
                        ride={original.ride}
                        offsets={offsets}
                        onChange={setValues}
                        onDurationEdited={() => setDurationEdited(true)}
                    />
                </fieldset>
                <div className="dialog-actions">
                    <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={cancel}
                    >
                        Cancel
                    </button>
                    <button
                        className="button primary"
                        type="submit"
                        disabled={busy || recovery}
                    >
                        Save ride
                    </button>
                </div>
            </form>
            <RideRecovery
                phase={save.state.phase}
                refreshed={save.state.refreshed}
                busy={busy}
                current={currentSummary}
                attempted={
                    save.state.attempted && (
                        <RideSummary ride={save.state.attempted.input} />
                    )
                }
                canRetry={!original.ride || !!current?.record}
                onRefresh={() => void refresh()}
                onRetry={() => void retry()}
                onCancel={cancel}
                onLoadMore={
                    current?.page?.nextCursor
                        ? () => void loadMore()
                        : undefined
                }
            />
        </Dialog>
    );
}
