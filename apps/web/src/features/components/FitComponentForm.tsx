'use client';
import { useEffect, useState, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    Position,
    ComponentResponse,
    InstallationResponse,
    Validated,
} from '@bikelog/api-client';
import { ApiError } from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { FormError } from '../../components/FormError';
import { getApi } from '../../lib/api';
import { formatLocal, toUtc } from '../../lib/dates';
import { invalidateBike, queryKeys } from '../../lib/query';
import { PartFields, allPages } from './fit-replacement';
export function FitComponentForm({
    bikeId,
    position,
    onSaved,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: {
    bikeId: string;
    position: Position;
    onSaved: (r: Validated<InstallationResponse>) => void;
    onCancel: () => void;
    onDirtyChange?: (v: boolean) => void;
    onBusyChange?: (v: boolean) => void;
}) {
    const [destination] = useState({ bikeId, position });
    const [model, setModel] = useState('');
    const [wall, setWall] = useState(() =>
        formatLocal(new Date().toISOString()),
    );
    const [initial] = useState(wall);
    const [offset, setOffset] = useState('');
    const [existing, setExisting] = useState('');
    const [createdComponentId, setCreated] = useState<string>();
    const [createdModel, setCreatedModel] = useState<string | null>();
    const [phase, setPhase] = useState<
        'creating' | 'fitting' | 'incomplete' | 'saved' | 'idle'
    >('idle');
    const [uncertain, setUncertain] = useState<'create' | 'fit' | null>(null);
    const [reviewed, setReviewed] = useState(false);
    const [parts, setParts] = useState<Validated<ComponentResponse>[]>([]);
    const [validationAttempt, setValidationAttempt] = useState(0);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<string[]>([]);
    const [reading, setReading] = useState(false);
    const client = useQueryClient();
    const id = useId();
    const type =
        destination.position === 'chain'
            ? 'chain'
            : destination.position === 'cassette'
              ? 'cassette'
              : 'tyre';
    const busy = phase === 'creating' || phase === 'fitting' || reading;
    async function refresh() {
        setReading(true);
        setReviewed(false);
        try {
            setParts(
                await allPages((cursor) =>
                    getApi().listComponents({ pageSize: 50, cursor }),
                ),
            );
            setReviewed(true);
        } catch (e) {
            setErrors([String(e)]);
        } finally {
            setReading(false);
        }
    }
    useEffect(() => {
        let active = true;
        allPages((cursor) => getApi().listComponents({ pageSize: 50, cursor }))
            .then((p) => {
                if (active) setParts(p);
            })
            .catch((e) => {
                if (active) setErrors([String(e)]);
            });
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        onDirtyChange?.(
            !!model ||
                wall !== initial ||
                !!existing ||
                !!createdComponentId ||
                !!uncertain,
        );
    }, [
        model,
        wall,
        initial,
        existing,
        createdComponentId,
        uncertain,
        onDirtyChange,
    ]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    async function submit() {
        setValidationAttempt((attempt) => attempt + 1);
        if (busy) return;
        setErrors([]);
        setFieldErrors({});
        let startUtc: string;
        try {
            startUtc = toUtc(wall, offset || undefined);
        } catch (e) {
            setFieldErrors({
                date: e instanceof Error ? e.message : String(e),
            });
            setErrors([String(e)]);
            return;
        }
        let componentId = createdComponentId || existing;
        try {
            if (!componentId) {
                if (!model.trim()) {
                    setFieldErrors({
                        model: 'Enter a model or select an unused component',
                    });
                    throw new Error(
                        'Enter a model or select an unused component',
                    );
                }
                setPhase('creating');
                const part = await getApi().createComponent({
                    type,
                    model: model.trim(),
                });
                componentId = part.id;
                setCreated(part.id);
                setCreatedModel(part.model);
                // Creation persists independently of the subsequent fitting request.
                const createdKeys = [
                    queryKeys.components(),
                    queryKeys.component(part.id),
                    queryKeys.componentUsage(part.id),
                    queryKeys.componentMaintenance(part.id),
                ];
                for (const queryKey of createdKeys)
                    await client.cancelQueries({ queryKey });
                await Promise.all(
                    createdKeys.map((queryKey) =>
                        client.resetQueries({ queryKey }),
                    ),
                );
            }
            setPhase('fitting');
            const result = await getApi().createInstallation({
                ...destination,
                componentId,
                startUtc,
            });
            const affected = new Set([
                destination.bikeId,
                ...(parts
                    .find((p) => p.id === componentId)
                    ?.installations.map((i) => i.bikeId) ?? []),
            ]);
            for (const affectedBikeId of affected)
                await invalidateBike(client, affectedBikeId, [componentId]);
            setPhase('saved');
            onDirtyChange?.(false);
            onSaved(result);
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            setErrors([error.message]);
            if (e instanceof ApiError && e.uncertain) {
                setUncertain(componentId ? 'fit' : 'create');
                setReviewed(false);
            }
            setPhase('incomplete');
        }
    }
    const compatible = parts.filter(
        (p) =>
            p.type === type && p.installations.every((i) => i.endUtc !== null),
    );
    return (
        <Dialog
            open
            title={`Fit ${destination.position}`}
            onCancel={() => {
                if (!busy) onCancel();
            }}
        >
            <p>
                After a failed fitting, the created part is retained. After
                reload, select it from the owner-wide unused collection.
            </p>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!uncertain) void submit();
                }}
            >
                <FormError key={validationAttempt} errors={errors} />
                <fieldset
                    disabled={busy || !!createdComponentId || !!uncertain}
                >
                    <Field id={id} label="Existing unused component">
                        <select
                            id={id}
                            value={existing}
                            onChange={(e) => setExisting(e.target.value)}
                        >
                            <option value="">Create new component</option>
                            {compatible.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.model} · {p.id}
                                </option>
                            ))}
                        </select>
                    </Field>
                </fieldset>
                <fieldset disabled={busy || !!uncertain}>
                    <PartFields
                        errors={fieldErrors}
                        model={
                            createdComponentId
                                ? (createdModel ?? 'Model not provided')
                                : existing
                                  ? (parts.find((p) => p.id === existing)
                                        ?.model ?? 'Model not provided')
                                  : model
                        }
                        modelReadOnly={!!createdComponentId || !!existing}
                        setModel={setModel}
                        wall={wall}
                        setWall={setWall}
                        offset={offset}
                        setOffset={setOffset}
                    />
                    {!createdComponentId && (
                        <button type="submit">Fit component</button>
                    )}
                </fieldset>
                <button type="button" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </form>
            {createdComponentId && (
                <p>
                    Part created; fitting incomplete. Retained component{' '}
                    {createdComponentId}
                </p>
            )}
            {createdComponentId && !uncertain && (
                <button disabled={busy} onClick={() => void submit()}>
                    Retry fitting retained component
                </button>
            )}
            {uncertain && (
                <section>
                    <p>
                        The {uncertain} outcome is uncertain. Refresh all owner
                        components and review their installation history before
                        explicitly resubmitting. Select a discovered unused part
                        to avoid duplicate creation.
                    </p>
                    <button disabled={busy} onClick={() => void refresh()}>
                        Refresh owner components
                    </button>
                    {reviewed && (
                        <>
                            <ul>
                                {parts.map((p) => (
                                    <li key={p.id}>
                                        {p.model} · {p.id} ·{' '}
                                        {p.installations.length} chapters{' '}
                                        {p.installations.map((i) => (
                                            <p key={i.id}>
                                                Installation {i.id} · bike{' '}
                                                {i.bikeId} · {i.position} ·{' '}
                                                {i.startUtc} —{' '}
                                                {i.endUtc ?? 'Open-ended'}
                                            </p>
                                        ))}
                                        {p.type === type &&
                                            p.installations.every(
                                                (i) => i.endUtc !== null,
                                            ) && (
                                                <button
                                                    onClick={() => {
                                                        setExisting(p.id);
                                                        setCreated(p.id);
                                                        setCreatedModel(
                                                            p.model,
                                                        );
                                                        setUncertain(null);
                                                    }}
                                                >
                                                    Resume fitting this unused
                                                    part
                                                </button>
                                            )}
                                    </li>
                                ))}
                            </ul>
                            <button
                                disabled={busy}
                                onClick={() => {
                                    setUncertain(null);
                                    void submit();
                                }}
                            >
                                Resubmit after review
                            </button>
                        </>
                    )}
                </section>
            )}
        </Dialog>
    );
}
