'use client';
import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
    CreateMaintenance,
    MaintenanceResponse,
    Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { FormError } from '../../components/FormError';
import { getApi } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import {
    formatLocal,
    toUtc,
    validOffsets,
    LOCAL_TIME_ZONE,
    withinInstallation,
} from '../../lib/dates';
import { parseEuroCost } from '../../lib/units';
import { useCompleteInstallations, readAllInstallations } from './queries';
import { useSaveMaintenance } from './mutations';
import { MaintenanceHistory } from './Maintenance';
export function MaintenanceForm({
    bikeId,
    presetTaskKey,
    onSaved,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: {
    bikeId: string;
    presetTaskKey?: 'chain-lubrication';
    onSaved: (m: Validated<MaintenanceResponse>) => void;
    onCancel: () => void;
    onDirtyChange?: (d: boolean) => void;
    onBusyChange?: (b: boolean) => void;
}) {
    const [original] = useState(() => ({ bikeId, presetTaskKey }));
    const [initialTime] = useState(() => formatLocal(new Date().toISOString()));
    const [time, setTime] = useState(initialTime);
    const [offset, setOffset] = useState('');
    const [task, setTask] = useState(presetTaskKey ? 'Chain lubrication' : '');
    const [notes, setNotes] = useState('');
    const [cost, setCost] = useState('');
    const [association, setAssociation] = useState(
        presetTaskKey ? 'chain' : '',
    );
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<string[]>([]);
    const [validationAttempt, setValidationAttempt] = useState(0);
    const id = useId();
    const history = useCompleteInstallations(original.bikeId);
    const save = useSaveMaintenance();
    const busy = save.state.phase === 'saving' || save.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(save.state.phase);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    useEffect(() => {
        onDirtyChange?.(
            recovery ||
                time !== initialTime ||
                task !== (original.presetTaskKey ? 'Chain lubrication' : '') ||
                notes !== '' ||
                cost !== '' ||
                association !== (original.presetTaskKey ? 'chain' : ''),
        );
    }, [
        time,
        initialTime,
        task,
        notes,
        cost,
        association,
        original,
        recovery,
        onDirtyChange,
    ]);
    let instant: string | undefined;
    let dateError: string | undefined;
    let offsets: string[] = [];
    try {
        offsets = validOffsets(time);
        instant = toUtc(time, offset || undefined);
    } catch (e) {
        dateError = e instanceof Error ? e.message : 'Invalid date';
    }
    const fitted =
        history.data?.filter(
            (i) => instant && withinInstallation(instant, i.startUtc, i.endUtc),
        ) ?? [];
    const positions = ['chain', 'cassette', 'front-tyre', 'rear-tyre'];
    const ambiguous = positions.some(
        (p) => fitted.filter((i) => i.position === p).length > 1,
    );
    const selected = fitted.find((i) => i.position === association);
    const complete = history.isSuccess && !history.isFetching && !ambiguous;
    const identities = useQuery({
        queryKey: [
            ...queryKeys.installations(original.bikeId, 'all'),
            'maintenance-identities',
            ...(history.data ?? []).map((i) => i.componentId).sort(),
        ],
        enabled: history.isSuccess,
        queryFn: async ({ signal }) =>
            Promise.all(
                [...new Set(history.data!.map((i) => i.componentId))].map(
                    (componentId) => getApi().getComponent(componentId, signal),
                ),
            ),
    });
    const associationReady =
        complete &&
        identities.isSuccess &&
        !identities.isFetching &&
        (!association || !!selected) &&
        !!instant;
    const current = save.state.current as
        | {
              items: Validated<MaintenanceResponse>[];
              installations: Awaited<ReturnType<typeof readAllInstallations>>;
          }
        | undefined;
    async function refresh() {
        await save.refreshCurrent(async () => ({
            items: await getApi().getBikeMaintenance(original.bikeId),
            installations: await readAllInstallations(original.bikeId),
        }));
    }
    async function finish(result: Validated<MaintenanceResponse> | undefined) {
        if (result) {
            onDirtyChange?.(false);
            onBusyChange?.(false);
            onSaved(result);
        }
    }
    async function submit() {
        setValidationAttempt((attempt) => attempt + 1);
        setErrors([]);
        setFieldErrors({});
        let field = 'association';
        let input: CreateMaintenance;
        try {
            if (!associationReady)
                throw new Error(
                    'Complete installation history and a valid association are required.',
                );
            field = 'task';
            if (!task.trim()) throw new Error('Task is required.');
            field = 'cost';
            const value = parseEuroCost(cost);
            input = {
                bikeId: original.bikeId,
                componentId: selected?.componentId ?? null,
                task: task.trim(),
                performedUtc: instant!,
                notes: notes.trim() ? notes : null,
                cost: value,
                currency: value === null ? null : 'EUR',
                ...(original.presetTaskKey
                    ? { taskKey: original.presetTaskKey }
                    : {}),
            };
        } catch (e) {
            setFieldErrors({
                [field]: e instanceof Error ? e.message : 'Invalid maintenance',
            });
            setErrors([e instanceof Error ? e.message : 'Invalid maintenance']);
            return;
        }
        await finish(await save.submit(input));
    }
    async function retry() {
        const input = save.state.attempted;
        if (!input || !current) return;
        setValidationAttempt((attempt) => attempt + 1);
        const at = input.performedUtc;
        const matches = current.installations.filter(
            (i) =>
                i.componentId === input.componentId &&
                withinInstallation(at, i.startUtc, i.endUtc),
        );
        if (input.componentId && matches.length !== 1) {
            setErrors([
                'The historical component association changed. Cancel and reopen the form to choose the saved history.',
            ]);
            return;
        }
        await finish(await save.resubmit(input));
    }
    return (
        <Dialog
            open
            title={
                original.presetTaskKey
                    ? 'Log chain lubrication'
                    : 'Log maintenance'
            }
            onCancel={() => {
                if (!busy) onCancel();
            }}
        >
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy && !recovery && associationReady) void submit();
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
                {history.isError || identities.isError ? (
                    <p role="alert">
                        Installation history unavailable. Retry before saving.
                    </p>
                ) : !complete || !identities.isSuccess ? (
                    <p>Loading complete installation history…</p>
                ) : null}
                {(history.isError || identities.isError) && (
                    <button
                        type="button"
                        disabled={busy || recovery}
                        onClick={() => {
                            void history.refetch();
                            void identities.refetch();
                        }}
                    >
                        Retry installation history
                    </button>
                )}
                {ambiguous && (
                    <p role="alert">
                        Installation history contains overlapping positions;
                        unable to choose an association.
                    </p>
                )}
                <fieldset disabled={busy || recovery}>
                    <Field
                        id={id + 'task'}
                        label="Task"
                        error={fieldErrors.task}
                    >
                        <input
                            id={id + 'task'}
                            value={task}
                            onChange={(e) => setTask(e.target.value)}
                            readOnly={!!original.presetTaskKey}
                        />
                    </Field>
                    <Field
                        id={id + 'date'}
                        label="Date and time"
                        error={dateError}
                        hint={`Local time in ${LOCAL_TIME_ZONE} · UTC offset ${offset || (offsets.length === 1 ? offsets[0] : 'choose a valid offset')}.`}
                    >
                        <input
                            id={id + 'date'}
                            type="datetime-local"
                            value={time}
                            onChange={(e) => {
                                setTime(e.target.value);
                                setOffset('');
                            }}
                        />
                    </Field>
                    {offsets.length > 1 && (
                        <Field id={id + 'offset'} label="UTC offset">
                            <select
                                id={id + 'offset'}
                                value={offset}
                                onChange={(e) => setOffset(e.target.value)}
                            >
                                <option value="">Choose offset</option>
                                {offsets.map((o) => (
                                    <option key={o} value={o}>
                                        {o}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    )}
                    <Field
                        id={id + 'association'}
                        label="Association"
                        error={fieldErrors.association}
                    >
                        <select
                            id={id + 'association'}
                            value={association}
                            disabled={!!original.presetTaskKey}
                            onChange={(e) => setAssociation(e.target.value)}
                        >
                            <option value="">Whole bike</option>
                            {positions.map((p) => {
                                const fit = fitted.find(
                                    (i) => i.position === p,
                                );
                                const component = identities.data?.find(
                                    (c) => c.id === fit?.componentId,
                                );
                                return (
                                    <option key={p} value={p} disabled={!fit}>
                                        {p}
                                        {fit
                                            ? ` · ${component ? `${component.make} ${component.model}` : fit.componentId} · ${fit.componentId}`
                                            : ' · no component at this time'}
                                    </option>
                                );
                            })}
                        </select>
                    </Field>
                    {selected && (
                        <p>At the entered time: {selected.componentId}</p>
                    )}
                    {association && !selected && complete && (
                        <p>No {association} installed at the entered time.</p>
                    )}
                    <Field id={id + 'notes'} label="Notes">
                        <textarea
                            id={id + 'notes'}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </Field>
                    <Field
                        id={id + 'cost'}
                        label="Cost (EUR)"
                        error={fieldErrors.cost}
                    >
                        <input
                            id={id + 'cost'}
                            value={cost}
                            inputMode="decimal"
                            onChange={(e) => setCost(e.target.value)}
                        />
                    </Field>
                    <button type="submit" disabled={!associationReady}>
                        Save maintenance
                    </button>
                </fieldset>
                <button type="button" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </form>
            {recovery && (
                <button disabled={busy} onClick={() => void refresh()}>
                    Refresh and check history
                </button>
            )}
            {current && (
                <section aria-label="Current maintenance history">
                    <MaintenanceHistory items={current.items} />
                    {!current.items.length && <p>No maintenance recorded.</p>}
                    <p>
                        Installation history checked:{' '}
                        {current.installations
                            .map(
                                (i) =>
                                    `${i.componentId} ${i.startUtc} to ${i.endUtc ?? 'present'}`,
                            )
                            .join('; ')}
                    </p>
                </section>
            )}
            {save.state.phase === 'uncertain' && (
                <section>
                    <p>
                        The save outcome is uncertain. Refresh and check history
                        for this entry before resubmitting.
                    </p>
                    {save.state.attempted && (
                        <p>
                            Attempted: {save.state.attempted.task} ·{' '}
                            {save.state.attempted.performedUtc} ·{' '}
                            {save.state.attempted.componentId ?? 'whole bike'}
                        </p>
                    )}
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
