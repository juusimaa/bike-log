'use client';
import { useEffect, useId, useState } from 'react';
import type {
    ComponentResponse,
    ComponentEstimateResponse,
    Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { FormError } from '../../components/FormError';
import { ConflictPanel } from '../../components/ConflictPanel';
import { getApi } from '../../lib/api';
import { parseKilometres } from '../../lib/units';
import { formatKilometres } from '../../lib/format';
import { useSaveEstimate, type EstimateSave } from './mutations';
export function EstimateForm({
    component,
    onSaved,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: {
    component: Validated<ComponentResponse>;
    onSaved: (result: Validated<ComponentEstimateResponse>) => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onBusyChange?: (busy: boolean) => void;
}) {
    const [original] = useState(component);
    const [initial] = useState(() =>
        formatKilometres(component.initialUsageEstimateMetres),
    );
    const [value, setValue] = useState(initial);
    const [validationAttempt, setValidationAttempt] = useState(0);
    const [errors, setErrors] = useState<string[]>([]);
    const id = useId();
    const save = useSaveEstimate();
    const busy = save.state.phase === 'saving' || save.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(save.state.phase);
    useEffect(() => {
        onDirtyChange?.(value !== initial || recovery);
    }, [value, initial, recovery, onDirtyChange]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    async function finish(
        result: Validated<ComponentEstimateResponse> | undefined,
    ) {
        if (result) {
            onDirtyChange?.(false);
            onBusyChange?.(false);
            onSaved(result);
        }
    }
    async function refresh() {
        await save.refreshCurrent(async () => ({
            component: await getApi().getComponent(original.id),
            usage: await getApi().getComponentUsage(original.id),
        }));
    }
    const current = save.state.current as
        | {
              component: Validated<ComponentResponse>;
              usage: Awaited<
                  ReturnType<ReturnType<typeof getApi>['getComponentUsage']>
              >;
          }
        | undefined;
    async function submit() {
        setValidationAttempt((n) => n + 1);
        setErrors([]);
        let attempt: EstimateSave;
        try {
            attempt = {
                componentId: original.id,
                input: {
                    initialUsageEstimateMetres: parseKilometres(value, true),
                    expectedVersion: original.version,
                },
                affectedBikeIds: original.installations.map((i) => i.bikeId),
            };
        } catch (e) {
            setErrors([e instanceof Error ? e.message : 'Invalid estimate']);
            return;
        }
        const result = await save.submit(attempt);
        if (save.getState().phase === 'conflict') await refresh();
        await finish(result);
    }
    async function retry() {
        if (!current || !save.state.attempted) return;
        const attempted = save.state.attempted;
        const attempt = {
            ...attempted,
            input: {
                ...attempted.input,
                expectedVersion: current.component.version,
            },
            affectedBikeIds: [
                ...attempted.affectedBikeIds,
                ...current.component.installations.map((i) => i.bikeId),
            ],
        };
        await finish(
            await (save.state.phase === 'conflict'
                ? save.reapply(attempt)
                : save.resubmit(attempt)),
        );
    }
    return (
        <Dialog
            open
            title="Edit starting estimate"
            onCancel={() => {
                if (!busy) onCancel();
            }}
        >
            <p>
                {original.make} {original.model} · component {original.id} ·
                version {original.version}
            </p>
            <p>
                The estimate stays separate from calculated ride usage and
                installation distance.
            </p>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy && !recovery) void submit();
                }}
            >
                <FormError
                    key={validationAttempt}
                    errors={[
                        ...errors,
                        ...(save.state.error ? [save.state.error.message] : []),
                        ...(save.state.refreshError
                            ? [save.state.refreshError.message]
                            : []),
                    ]}
                />
                <fieldset disabled={busy || recovery}>
                    <Field
                        id={id}
                        label="Starting estimate (km)"
                        error={errors[0]}
                    >
                        <input
                            id={id}
                            value={value}
                            inputMode="decimal"
                            onChange={(e) => setValue(e.target.value)}
                        />
                    </Field>
                    <button type="submit">Save estimate</button>
                </fieldset>
                <button type="button" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </form>
            {recovery && (
                <button disabled={busy} onClick={() => void refresh()}>
                    Refresh saved data and usage
                </button>
            )}
            {current && (
                <section aria-label="Current saved data">
                    <p>
                        Saved estimate:{' '}
                        {formatKilometres(
                            current.component.initialUsageEstimateMetres,
                        )}{' '}
                        km · saved version {current.component.version}
                    </p>
                    <p>
                        Calculated lifetime:{' '}
                        {formatKilometres(current.usage.lifetimeMetres)} km
                    </p>
                    <p>
                        Combined lifetime:{' '}
                        {formatKilometres(current.usage.combinedLifetimeMetres)}{' '}
                        km
                    </p>
                </section>
            )}
            {save.state.phase === 'conflict' &&
                current &&
                save.state.attempted && (
                    <ConflictPanel
                        attempted={
                            <p>
                                Attempted estimate:{' '}
                                {formatKilometres(
                                    Number(
                                        save.state.attempted.input
                                            .initialUsageEstimateMetres,
                                    ),
                                )}{' '}
                                km · version{' '}
                                {save.state.attempted.input.expectedVersion}
                            </p>
                        }
                        current={
                            <p>
                                Saved estimate:{' '}
                                {formatKilometres(
                                    current.component
                                        .initialUsageEstimateMetres,
                                )}{' '}
                                km · version {current.component.version}
                            </p>
                        }
                        onReapply={() => void retry()}
                        onCancel={onCancel}
                    />
                )}
            {save.state.phase === 'uncertain' && (
                <section>
                    <p>
                        The save outcome is uncertain. Refresh saved data and
                        check the estimate and usage before resubmitting.
                    </p>
                    <button
                        disabled={busy || !save.state.refreshed}
                        onClick={() => void retry()}
                    >
                        Resubmit after review
                    </button>
                </section>
            )}
        </Dialog>
    );
}
