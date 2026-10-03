'use client';
import { useEffect, useId, useState } from 'react';
import type {
    EditReminder,
    ReminderEvaluation,
    Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { FormError } from '../../components/FormError';
import { ConflictPanel } from '../../components/ConflictPanel';
import { getApi } from '../../lib/api';
import { parseKilometres } from '../../lib/units';
import { useSaveReminder } from './mutations';
function describe(e: Validated<ReminderEvaluation>) {
    return (
        <>
            <p>
                Saved rule version {e.ruleVersion} ·{' '}
                {e.enabled ? 'enabled' : 'disabled'} · method{' '}
                {e.method ?? 'unset'}
            </p>
            <p>
                Oil:{' '}
                {e.oilThresholdMetres === null
                    ? 'unset'
                    : `${e.oilThresholdMetres / 1000} km`}{' '}
                · wax:{' '}
                {e.waxThresholdMetres === null
                    ? 'unset'
                    : `${e.waxThresholdMetres / 1000} km`}
            </p>
            <p>
                Baseline: {e.baselineUtc ?? 'none'} · distance since baseline:{' '}
                {e.distanceSinceBaselineMetres ?? 'unknown'} m · state:{' '}
                {e.state}
            </p>
        </>
    );
}
export function ReminderForm({
    bikeId,
    evaluation,
    onSaved,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: {
    bikeId: string;
    evaluation: Validated<ReminderEvaluation>;
    onSaved: (e: Validated<ReminderEvaluation>) => void;
    onCancel: () => void;
    onDirtyChange?: (d: boolean) => void;
    onBusyChange?: (b: boolean) => void;
}) {
    const [original] = useState(() => ({ bikeId, evaluation }));
    const [enabled, setEnabled] = useState(evaluation.enabled);
    const [method, setMethod] = useState(evaluation.method ?? '');
    const [oil, setOil] = useState(
        evaluation.oilThresholdMetres === null
            ? ''
            : String(evaluation.oilThresholdMetres / 1000),
    );
    const [wax, setWax] = useState(
        evaluation.waxThresholdMetres === null
            ? ''
            : String(evaluation.waxThresholdMetres / 1000),
    );
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<string[]>([]);
    const [validationAttempt, setValidationAttempt] = useState(0);
    const id = useId();
    const save = useSaveReminder(original.bikeId);
    const busy = save.state.phase === 'saving' || save.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(save.state.phase);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    useEffect(() => {
        const e = original.evaluation;
        onDirtyChange?.(
            recovery ||
                enabled !== e.enabled ||
                method !== (e.method ?? '') ||
                oil !==
                    (e.oilThresholdMetres === null
                        ? ''
                        : String(e.oilThresholdMetres / 1000)) ||
                wax !==
                    (e.waxThresholdMetres === null
                        ? ''
                        : String(e.waxThresholdMetres / 1000)),
        );
    }, [original, enabled, method, oil, wax, recovery, onDirtyChange]);
    const current = save.state.current as
        Validated<ReminderEvaluation> | undefined;
    async function finish(result: Validated<ReminderEvaluation> | undefined) {
        if (result) {
            onDirtyChange?.(false);
            onBusyChange?.(false);
            onSaved(result);
        }
    }
    async function refresh() {
        await save.refreshCurrent(() => getApi().getReminder(original.bikeId));
    }
    function threshold(value: string) {
        if (!value.trim()) return null;
        const metres = parseKilometres(value, false);
        if (metres < 1000 || metres > 10000000)
            throw new Error('Intervals must be between 1 and 10000 km.');
        return metres;
    }
    async function submit() {
        setValidationAttempt((attempt) => attempt + 1);
        setErrors([]);
        setFieldErrors({});
        let field = 'method';
        let input: EditReminder;
        try {
            if (enabled && !method)
                throw new Error('Select a method when enabling the reminder.');
            field = 'oil';
            const oilThresholdMetres = threshold(oil);
            if (enabled && oilThresholdMetres === null)
                throw new Error(
                    'Both oil and wax intervals are required when enabled.',
                );
            field = 'wax';
            const waxThresholdMetres = threshold(wax);
            if (
                enabled &&
                (oilThresholdMetres === null || waxThresholdMetres === null)
            )
                throw new Error(
                    'Both oil and wax intervals are required when enabled.',
                );
            input = {
                enabled,
                method: method === 'oil' || method === 'wax' ? method : null,
                oilThresholdMetres,
                waxThresholdMetres,
                expectedVersion: original.evaluation.ruleVersion,
            };
        } catch (e) {
            setFieldErrors({
                [field]: e instanceof Error ? e.message : 'Invalid reminder',
            });
            setErrors([e instanceof Error ? e.message : 'Invalid reminder']);
            return;
        }
        const result = await save.submit(input);
        if (save.getState().phase === 'conflict') await refresh();
        await finish(result);
    }
    async function retry() {
        if (!current || !save.state.attempted) return;
        const input = {
            ...save.state.attempted,
            expectedVersion: current.ruleVersion,
        };
        await finish(
            await (save.state.phase === 'conflict'
                ? save.reapply(input)
                : save.resubmit(input)),
        );
    }
    return (
        <Dialog
            open
            title="Configure lubrication reminder"
            onCancel={() => {
                if (!busy) onCancel();
            }}
        >
            <p>
                Changing the method or interval does not record maintenance or
                reset the baseline.
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
                    <Field id={id + 'enabled'} label="Enabled">
                        <input
                            id={id + 'enabled'}
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                        />
                    </Field>
                    <Field
                        id={id + 'method'}
                        label="Method"
                        error={fieldErrors.method}
                    >
                        <select
                            id={id + 'method'}
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                        >
                            <option value="">Choose method</option>
                            <option value="oil">Oil</option>
                            <option value="wax">Wax</option>
                        </select>
                    </Field>
                    <Field
                        id={id + 'oil'}
                        label="Oil interval (km)"
                        error={fieldErrors.oil}
                    >
                        <input
                            id={id + 'oil'}
                            inputMode="decimal"
                            value={oil}
                            onChange={(e) => setOil(e.target.value)}
                        />
                    </Field>
                    <Field
                        id={id + 'wax'}
                        label="Wax interval (km)"
                        error={fieldErrors.wax}
                    >
                        <input
                            id={id + 'wax'}
                            inputMode="decimal"
                            value={wax}
                            onChange={(e) => setWax(e.target.value)}
                        />
                    </Field>
                </fieldset>
                <div className="dialog-actions">
                    <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        className="button primary"
                        type="submit"
                        disabled={busy || recovery}
                    >
                        Save reminder
                    </button>
                </div>
            </form>
            {recovery && (
                <button disabled={busy} onClick={() => void refresh()}>
                    Refresh saved reminder
                </button>
            )}
            {current && (
                <section aria-label="Current saved reminder">
                    {describe(current)}
                </section>
            )}
            {save.state.phase === 'conflict' &&
                current &&
                save.state.attempted && (
                    <ConflictPanel
                        attempted={
                            <p>
                                Attempted rule version{' '}
                                {save.state.attempted.expectedVersion} · method{' '}
                                {save.state.attempted.method ?? 'unset'} · oil{' '}
                                {save.state.attempted.oilThresholdMetres ??
                                    'unset'}{' '}
                                m · wax{' '}
                                {save.state.attempted.waxThresholdMetres ??
                                    'unset'}{' '}
                                m ·{' '}
                                {save.state.attempted.enabled
                                    ? 'enabled'
                                    : 'disabled'}
                            </p>
                        }
                        current={describe(current)}
                        onReapply={() => void retry()}
                        onCancel={() => {
                            if (!busy) onCancel();
                        }}
                    />
                )}
            {save.state.phase === 'uncertain' && (
                <section>
                    <p>
                        The save outcome is uncertain. Refresh and check the
                        saved reminder before resubmitting.
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
