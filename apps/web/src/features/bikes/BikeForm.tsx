'use client';
import { useEffect, useId, useState } from 'react';
import type {
    BikeResponse,
    CreateBike,
    EditBike,
    Validated,
    PageResponseOfBikeResponse,
} from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { FormError } from '../../components/FormError';
import { ConflictPanel } from '../../components/ConflictPanel';
import { useSaveBike, type BikeSave } from './mutations';
type Props = {
    bike?: Validated<BikeResponse>;
    onSaved: (bike: Validated<BikeResponse>) => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    onBusyChange?: (busy: boolean) => void;
};
export function BikeForm({
    bike,
    onSaved,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: Props) {
    const [original] = useState(bike);
    const [initial] = useState(() => ({
        name: bike?.name ?? '',
        make: bike?.make ?? '',
        model: bike?.model ?? '',
        kind: bike?.kind ?? '',
        year: bike?.year?.toString() ?? '',
        color: bike?.color ?? '',
    }));
    const [values, setValues] = useState(initial);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<string[]>([]);
    const [attemptCount, setAttemptCount] = useState(0);
    const prefix = useId();
    const save = useSaveBike();
    const busy = save.state.phase === 'saving' || save.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(save.state.phase);
    const dirty =
        JSON.stringify(values) !== JSON.stringify(initial) || recovery;
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    function cancel() {
        if (!busy) onCancel();
    }
    function payload(): BikeSave | undefined {
        const problems: Record<string, string> = {};
        for (const field of ['make', 'model'] as const) {
            if (!values[field].trim())
                problems[field] =
                    `${field === 'make' ? 'Make' : 'Model'} is required.`;
            else if (values[field].trim().length > 100)
                problems[field] = `${field} must be at most 100 characters.`;
        }
        if (values.name.trim().length > 100)
            problems.name = 'Bike name must be at most 100 characters.';
        if (
            !['gravel', 'road', 'mountain', 'hybrid', 'other'].includes(
                values.kind,
            )
        )
            problems.kind = 'Kind is required.';
        if (
            !/^\d{4}$/.test(values.year) ||
            Number(values.year) < 1900 ||
            Number(values.year) > 9999
        )
            problems.year = 'Year must be a whole year from 1900 to 9999.';
        if (values.color.trim().length > 100)
            problems.color = 'Color must be at most 100 characters.';
        setFieldErrors(problems);
        setErrors(Object.values(problems));
        setAttemptCount((n) => n + 1);
        if (Object.keys(problems).length) return;
        const input: CreateBike = {
            name: values.name.trim() || null,
            make: values.make.trim(),
            model: values.model.trim(),
            kind: values.kind as CreateBike['kind'],
            year: Number(values.year),
            color: values.color.trim() || null,
        };
        return {
            bikeId: original?.id ?? null,
            input: original
                ? { ...input, expectedVersion: original.version }
                : input,
        };
    }
    async function finish(result: Validated<BikeResponse> | undefined) {
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
    async function refresh() {
        await save.refreshCurrent(() =>
            original
                ? getApi().getBike(original.id)
                : getApi().listBikes({ pageSize: 50 }),
        );
    }
    const current = original
        ? (save.state.current as Validated<BikeResponse> | undefined)
        : undefined;
    const savedPage = !original
        ? (save.state.current as
              Validated<PageResponseOfBikeResponse> | undefined)
        : undefined;
    async function loadMoreSaved() {
        if (!savedPage?.nextCursor) return;
        const cursor = savedPage.nextCursor;
        await save.refreshCurrent(async () => {
            const page = await getApi().listBikes({ pageSize: 50, cursor });
            return {
                ...page,
                items: Array.from(
                    new Map(
                        [...savedPage.items, ...page.items].map((bike) => [
                            bike.id,
                            bike,
                        ]),
                    ).values(),
                ),
            };
        });
    }
    async function retry() {
        const attempted = save.state.attempted;
        if (!attempted) return;
        const input =
            original && current && 'version' in current
                ? { ...attempted.input, expectedVersion: current.version }
                : attempted.input;
        await finish(
            await (save.state.phase === 'conflict'
                ? save.reapply({ ...attempted, input })
                : save.resubmit({ ...attempted, input })),
        );
    }
    function summary(record: CreateBike | BikeResponse) {
        return (
            <p>
                {('displayName' in record ? record.displayName : record.name) ??
                    'Automatic name'}{' '}
                · {record.make ?? 'Not recorded'} ·{' '}
                {record.model ?? 'Not recorded'} ·{' '}
                {record.kind ?? 'Not recorded'} ·{' '}
                {record.year ?? 'Not recorded'} · {record.color ?? 'No color'}
            </p>
        );
    }
    return (
        <Dialog
            open
            title={original ? 'Edit bike' : 'Create bike'}
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
                    {(['name', 'make', 'model', 'year', 'color'] as const).map(
                        (key) => (
                            <Field
                                key={key}
                                error={fieldErrors[key]}
                                id={`${prefix}-${key}`}
                                label={
                                    {
                                        name: 'Bike name',
                                        make: 'Make',
                                        model: 'Model',
                                        year: 'Year',
                                        color: 'Color',
                                    }[key]
                                }
                                hint={
                                    key === 'name'
                                        ? 'Optional. Leave blank to use the server name from make and model.'
                                        : key === 'color'
                                          ? 'Optional color name, e.g. Hazy IPA (up to 100 characters).'
                                          : undefined
                                }
                            >
                                <input
                                    id={`${prefix}-${key}`}
                                    value={values[key]}
                                    onChange={(e) =>
                                        setValues({
                                            ...values,
                                            [key]: e.target.value,
                                        })
                                    }
                                    maxLength={key === 'year' ? 4 : 100}
                                    inputMode={
                                        key === 'year' ? 'numeric' : undefined
                                    }
                                />
                            </Field>
                        ),
                    )}
                    <Field
                        id={`${prefix}-kind`}
                        label="Kind"
                        error={fieldErrors.kind}
                    >
                        <select
                            id={`${prefix}-kind`}
                            value={values.kind}
                            onChange={(e) =>
                                setValues({ ...values, kind: e.target.value })
                            }
                        >
                            <option value="">Choose kind</option>
                            {[
                                'gravel',
                                'road',
                                'mountain',
                                'hybrid',
                                'other',
                            ].map((kind) => (
                                <option key={kind} value={kind}>
                                    {kind}
                                </option>
                            ))}
                        </select>
                    </Field>
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
                        Save bike
                    </button>
                </div>
            </form>
            {save.state.phase === 'conflict' &&
                save.state.refreshed &&
                current &&
                save.state.attempted && (
                    <ConflictPanel
                        attempted={
                            <>
                                {summary(save.state.attempted.input)}
                                <p>
                                    Attempted version{' '}
                                    {
                                        (save.state.attempted.input as EditBike)
                                            .expectedVersion
                                    }
                                </p>
                            </>
                        }
                        current={
                            <>
                                {summary(current)}
                                <p>Saved version {current.version}</p>
                            </>
                        }
                        onReapply={() => void retry()}
                        onCancel={cancel}
                    />
                )}
            {save.state.phase === 'conflict' && !save.state.refreshed && (
                <button disabled={busy} onClick={() => void refresh()}>
                    Refresh saved data
                </button>
            )}
            {save.state.phase === 'uncertain' && (
                <section aria-label="Uncertain save">
                    <p>
                        The save outcome is uncertain. Refresh saved data and
                        check whether your changes already exist before
                        resubmitting. Creating again may create a duplicate
                        bike.
                    </p>
                    <button disabled={busy} onClick={() => void refresh()}>
                        Refresh saved data
                    </button>
                    {!!save.state.current && (
                        <section aria-label="Current saved data">
                            <h3>Current saved data</h3>
                            {current && (
                                <>
                                    {summary(current)}
                                    <p>Saved version {current.version}</p>
                                </>
                            )}
                            {savedPage && (
                                <>
                                    {savedPage.items.map((record) => (
                                        <article key={record.id}>
                                            <h4>{record.displayName}</h4>
                                            {summary(record)}
                                        </article>
                                    ))}
                                    {savedPage.items.length === 0 && (
                                        <p>No bikes on this page.</p>
                                    )}
                                    {savedPage.nextCursor && (
                                        <>
                                            <p>
                                                More bikes exist. Check the next
                                                page before creating again.
                                            </p>
                                            <button
                                                disabled={busy}
                                                onClick={() =>
                                                    void loadMoreSaved()
                                                }
                                            >
                                                Load more saved bikes
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </section>
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
