'use client';
import { useEffect, useState, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    Position,
    ComponentResponse,
    InstallationResponse,
    PositionExemptionResponse,
    Validated,
} from '@bikelog/api-client';
import { ApiError } from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { FormError } from '../../components/FormError';
import { getApi } from '../../lib/api';
import { formatLocal, formatDate, toUtc } from '../../lib/dates';
import { formatGrams } from '../../lib/format';
import { parseGrams, parseKilometres } from '../../lib/units';
import { invalidateBike, queryKeys } from '../../lib/query';
import { PartFields, WhenField, allPages } from './fit-replacement';
import { problemText } from './ActionDialog';
import {
    useComponentCatalog,
    entryOf,
    oppositeOf,
    typeLabel,
    positionLabel,
} from './catalog';
import { useBikes, useOverview } from '../garage/queries';
type Source = 'new' | 'garage' | 'bike';
type Part = Validated<ComponentResponse>;
/** Pair types fitted to both ends by default (owner-approved V3 design). */
const PAIR_BY_DEFAULT = new Set(['brake', 'brake-lever', 'disc-rotor']);
export function FitComponentForm({
    bikeId,
    position,
    exemption,
    onSaved,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: {
    bikeId: string;
    position: Position;
    /** An open "none fitted" period that fitting a part ends at the fitting date. */
    exemption?: Validated<PositionExemptionResponse>;
    onSaved: (r: Validated<InstallationResponse>) => void;
    onCancel: () => void;
    onDirtyChange?: (v: boolean) => void;
    onBusyChange?: (v: boolean) => void;
}) {
    const [destination] = useState({ bikeId, position });
    const catalog = useComponentCatalog();
    const overview = useOverview(bikeId);
    const bikes = useBikes();
    const entry = entryOf(catalog.data, destination.position);
    const opposite = entry ? oppositeOf(catalog.data, entry) : undefined;
    const oppositeState = overview.data?.positionStatuses.find(
        (s) => s.position === opposite?.position,
    )?.state;
    const pairOffered =
        !!entry &&
        !!opposite &&
        !exemption &&
        !!catalog.data?.pairTypes.includes(entry.type) &&
        (oppositeState === 'not-recorded' || oppositeState === 'missing');
    const [source, setSource] = useState<Source>('new');
    const [make, setMake] = useState('');
    const [model, setModel] = useState('');
    const [weight, setWeight] = useState('');
    const [estimate, setEstimate] = useState('');
    const [pairChoice, setPairChoice] = useState<boolean | null>(null);
    const pair =
        pairOffered &&
        source === 'new' &&
        (pairChoice ?? PAIR_BY_DEFAULT.has(entry?.type ?? ''));
    const [wall, setWall] = useState(() =>
        formatLocal(new Date().toISOString()),
    );
    const [initial] = useState(wall);
    const [offset, setOffset] = useState('');
    const [existing, setExisting] = useState('');
    const [donor, setDonor] = useState('');
    const [createdComponentId, setCreated] = useState<string>();
    const [createdMake, setCreatedMake] = useState<string | null>();
    const [createdModel, setCreatedModel] = useState<string | null>();
    const [exemptionEnded, setExemptionEnded] = useState(false);
    const [phase, setPhase] = useState<
        'creating' | 'fitting' | 'incomplete' | 'saved' | 'idle'
    >('idle');
    const [uncertain, setUncertain] = useState<'create' | 'fit' | null>(null);
    const [reviewed, setReviewed] = useState(false);
    const [parts, setParts] = useState<Part[]>([]);
    const [validationAttempt, setValidationAttempt] = useState(0);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<string[]>([]);
    const [reading, setReading] = useState(false);
    const client = useQueryClient();
    const id = useId();
    const type = entry?.type;
    const label = positionLabel(catalog.data, destination.position);
    const kind = typeLabel(catalog.data, type ?? '');
    const busy = phase === 'creating' || phase === 'fitting' || reading;
    const bikeName = (id: string) =>
        bikes.data?.pages.flatMap((p) => p.items).find((b) => b.id === id)
            ?.displayName ?? 'another bike';
    async function readParts() {
        setParts(
            await allPages((cursor) =>
                getApi().listComponents({ pageSize: 50, cursor }),
            ),
        );
    }
    async function refresh() {
        setReading(true);
        setReviewed(false);
        try {
            await readParts();
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
            !!make ||
                !!model ||
                !!weight ||
                !!estimate ||
                wall !== initial ||
                !!existing ||
                !!donor ||
                !!createdComponentId ||
                !!uncertain,
        );
    }, [
        make,
        model,
        weight,
        estimate,
        wall,
        initial,
        existing,
        donor,
        createdComponentId,
        uncertain,
        onDirtyChange,
    ]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    const garage = parts.filter(
        (p) =>
            p.type === type && p.installations.every((i) => i.endUtc !== null),
    );
    const fittedElsewhere = parts.flatMap((p) => {
        const open = p.installations.find(
            (i) => i.endUtc === null && i.bikeId !== destination.bikeId,
        );
        return p.type === type && open ? [{ part: p, installation: open }] : [];
    });
    const chosenDonor = fittedElsewhere.find(
        (d) => d.installation.id === donor,
    );
    async function invalidateParts(componentIds: string[], bikeIds: string[]) {
        for (const affected of new Set([destination.bikeId, ...bikeIds]))
            await invalidateBike(client, affected, componentIds);
    }
    /** Fitting into a "none fitted" position first ends that period at the fitting date. */
    async function endExemption(startUtc: string) {
        if (!exemption || exemptionEnded) return;
        await getApi().correctExemption(exemption.id, {
            startUtc: exemption.startUtc,
            endUtc: startUtc,
            expectedVersion: exemption.version,
        });
        setExemptionEnded(true);
    }
    function parseInputs() {
        let weightGrams: number | null = null;
        let estimateMetres = 0;
        try {
            weightGrams = parseGrams(weight);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setFieldErrors({ weight: message });
            throw new Error(message);
        }
        try {
            estimateMetres = estimate.trim()
                ? parseKilometres(estimate, true)
                : 0;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setFieldErrors({ estimate: message });
            throw new Error(message);
        }
        return { weightGrams, estimateMetres };
    }
    async function submit() {
        setValidationAttempt((attempt) => attempt + 1);
        if (busy) return;
        setErrors([]);
        setFieldErrors({});
        if (!type) {
            setErrors(['The parts catalog is still loading. Try again.']);
            return;
        }
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
        if (source === 'bike' && !createdComponentId)
            return void moveFromBike(startUtc);
        let componentId = createdComponentId || existing;
        try {
            if (source === 'garage' && !componentId && !createdComponentId)
                throw new Error('Choose a part from your garage.');
            if (!componentId) {
                if (!make.trim()) {
                    setFieldErrors({
                        make: 'Enter a make or select an unused component',
                    });
                    throw new Error(
                        'Enter a make or select an unused component',
                    );
                }
                if (!model.trim()) {
                    setFieldErrors({
                        model: 'Enter a model or select an unused component',
                    });
                    throw new Error(
                        'Enter a model or select an unused component',
                    );
                }
                const { weightGrams, estimateMetres } = parseInputs();
                if (pair)
                    return void fitPair(startUtc, weightGrams, estimateMetres);
                setPhase('creating');
                const part = await getApi().createComponent({
                    type,
                    make: make.trim(),
                    model: model.trim(),
                    ...(weightGrams === null ? {} : { weightGrams }),
                });
                componentId = part.id;
                setCreated(part.id);
                setCreatedMake(part.make);
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
                if (estimateMetres > 0)
                    await getApi().editEstimate(part.id, {
                        initialUsageEstimateMetres: estimateMetres,
                        expectedVersion: part.version,
                    });
            }
            setPhase('fitting');
            await endExemption(startUtc);
            const result = await getApi().createInstallation({
                ...destination,
                componentId,
                startUtc,
            });
            await invalidateParts(
                [componentId],
                parts
                    .find((p) => p.id === componentId)
                    ?.installations.map((i) => i.bikeId) ?? [],
            );
            setPhase('saved');
            onDirtyChange?.(false);
            onSaved(result);
        } catch (e) {
            setErrors([problemText(e)]);
            if (e instanceof ApiError && e.uncertain) {
                setUncertain(componentId ? 'fit' : 'create');
                setReviewed(false);
            }
            setPhase('incomplete');
        }
    }
    async function fitPair(
        startUtc: string,
        weightGrams: number | null,
        estimateMetres: number,
    ) {
        setPhase('fitting');
        try {
            const result = await getApi().fitPair({
                bikeId: destination.bikeId,
                type: type!,
                make: make.trim(),
                model: model.trim(),
                weightGrams,
                startUtc,
                initialUsageEstimateMetres: estimateMetres,
            });
            await invalidateParts(
                [result.front.component.id, result.rear.component.id],
                [],
            );
            setPhase('saved');
            onDirtyChange?.(false);
            onSaved(
                result.front.installation.position === destination.position
                    ? result.front.installation
                    : result.rear.installation,
            );
        } catch (e) {
            setErrors([
                e instanceof ApiError && e.code === 'installation_overlap'
                    ? `The ${label.toLowerCase()} or the ${opposite?.label.toLowerCase()} already has history on or after this date, so nothing was saved. Fit it separately or untick “Also fit”.`
                    : problemText(e),
            ]);
            if (e instanceof ApiError && e.uncertain) {
                setUncertain('create');
                setReviewed(false);
            }
            setPhase('incomplete');
        }
    }
    async function moveFromBike(startUtc: string) {
        if (!chosenDonor) {
            setErrors(['Choose a part from another bike.']);
            return;
        }
        setPhase('fitting');
        try {
            await endExemption(startUtc);
            const result = await getApi().moveInstallation(
                chosenDonor.installation.id,
                {
                    toBikeId: destination.bikeId,
                    toPosition: destination.position,
                    movedAtUtc: startUtc,
                    expectedInstallationVersion:
                        chosenDonor.installation.version,
                },
            );
            await invalidateParts(
                [chosenDonor.part.id],
                [chosenDonor.installation.bikeId],
            );
            setPhase('saved');
            onDirtyChange?.(false);
            onSaved(result.newInstallation);
        } catch (e) {
            setErrors([problemText(e)]);
            setDonor('');
            await readParts().catch(() => undefined);
            setPhase('incomplete');
        }
    }
    const weightText = (p: Part) =>
        p.weightGrams === null ? 'No weight' : formatGrams(p.weightGrams);
    return (
        <Dialog
            open
            title={`Fit ${label.toLowerCase()}`}
            onCancel={() => {
                if (!busy) onCancel();
            }}
        >
            {type && (
                <p className="fixed-type">
                    Only a {kind} can go here
                    {entry?.end
                        ? `; front and rear ${kind} parts are interchangeable`
                        : ''}
                    .
                </p>
            )}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!uncertain) void submit();
                }}
            >
                <FormError key={validationAttempt} errors={errors} />
                <fieldset
                    className="segmented"
                    disabled={busy || !!createdComponentId || !!uncertain}
                >
                    <legend className="visually-hidden">
                        Source of the part
                    </legend>
                    {(
                        [
                            ['new', 'New part', ''],
                            [
                                'garage',
                                'From your garage',
                                garage.length
                                    ? `${garage.length} spare`
                                    : 'none',
                            ],
                            [
                                'bike',
                                'From another bike',
                                fittedElsewhere.length
                                    ? `${fittedElsewhere.length} fitted`
                                    : 'none',
                            ],
                        ] as const
                    ).map(([value, text, note]) => (
                        <label key={value}>
                            <input
                                type="radio"
                                name={`${id}-source`}
                                value={value}
                                checked={source === value}
                                onChange={() => {
                                    setSource(value);
                                    setExisting('');
                                    setDonor('');
                                }}
                            />
                            {text}
                            {note && <small>{note}</small>}
                        </label>
                    ))}
                </fieldset>
                {source === 'garage' && !createdComponentId && (
                    <fieldset
                        className="choice-list"
                        disabled={busy || !!uncertain}
                    >
                        <legend>Part from your garage</legend>
                        {garage.length === 0 && (
                            <p className="empty-choice">
                                No spare {kind} in your garage. Choose{' '}
                                <strong>New part</strong>, or take one from
                                another bike.
                            </p>
                        )}
                        {garage.map((p) => {
                            const last = p.installations.at(-1);
                            return (
                                <label className="choice" key={p.id}>
                                    <input
                                        type="radio"
                                        name={`${id}-garage`}
                                        value={p.id}
                                        checked={existing === p.id}
                                        onChange={() => setExisting(p.id)}
                                    />
                                    <span>
                                        {p.make} {p.model}
                                        <small>
                                            {last?.endUtc
                                                ? `Last on ${bikeName(last.bikeId)} until ${formatDate(last.endUtc)}`
                                                : 'Never fitted'}
                                        </small>
                                    </span>
                                    <span className="meta">
                                        {weightText(p)}
                                    </span>
                                </label>
                            );
                        })}
                    </fieldset>
                )}
                {source === 'bike' && (
                    <fieldset className="choice-list" disabled={busy}>
                        <legend>Part fitted to another bike</legend>
                        {fittedElsewhere.length === 0 && (
                            <p className="empty-choice">
                                No {kind} is fitted to your other bikes.
                            </p>
                        )}
                        {fittedElsewhere.map(({ part: p, installation: i }) => (
                            <label className="choice" key={i.id}>
                                <input
                                    type="radio"
                                    name={`${id}-donor`}
                                    value={i.id}
                                    checked={donor === i.id}
                                    onChange={() => setDonor(i.id)}
                                />
                                <span>
                                    {p.make} {p.model}
                                    <small>
                                        Fitted to {bikeName(i.bikeId)} ·{' '}
                                        {positionLabel(
                                            catalog.data,
                                            i.position,
                                        ).toLowerCase()}
                                    </small>
                                </span>
                                <span className="meta">{weightText(p)}</span>
                            </label>
                        ))}
                        {chosenDonor && (
                            <div className="notice inline" role="note">
                                <p>
                                    <strong>
                                        {bikeName(
                                            chosenDonor.installation.bikeId,
                                        )}{' '}
                                        will be incomplete.
                                    </strong>{' '}
                                    It will have no{' '}
                                    {positionLabel(
                                        catalog.data,
                                        chosenDonor.installation.position,
                                    ).toLowerCase()}{' '}
                                    from the date below until you fit one. Rides
                                    can still be logged on it.
                                </p>
                            </div>
                        )}
                    </fieldset>
                )}
                {source === 'bike' ||
                (source === 'garage' && !createdComponentId) ? (
                    <fieldset disabled={busy || !!uncertain}>
                        <WhenField
                            label="Fitted on"
                            wall={wall}
                            setWall={setWall}
                            offset={offset}
                            setOffset={setOffset}
                            error={fieldErrors.date}
                        />
                    </fieldset>
                ) : (
                    <fieldset disabled={busy || !!uncertain}>
                        <PartFields
                            errors={fieldErrors}
                            make={
                                createdComponentId ? (createdMake ?? '') : make
                            }
                            setMake={setMake}
                            model={
                                createdComponentId
                                    ? (createdModel ?? 'Model not provided')
                                    : model
                            }
                            modelReadOnly={!!createdComponentId}
                            setModel={setModel}
                            weight={weight}
                            setWeight={
                                createdComponentId ? undefined : setWeight
                            }
                            wall={wall}
                            setWall={setWall}
                            offset={offset}
                            setOffset={setOffset}
                        />
                        {!createdComponentId && (
                            <Field
                                id={`${id}-estimate`}
                                label="Known starting usage (km)"
                                error={fieldErrors.estimate}
                                hint="Optional. For a used part; shown as an estimate, never as recorded rides."
                            >
                                <input
                                    value={estimate}
                                    inputMode="decimal"
                                    placeholder="0"
                                    onChange={(e) =>
                                        setEstimate(e.target.value)
                                    }
                                />
                            </Field>
                        )}
                        {pairOffered && !createdComponentId && (
                            <label className="check">
                                <input
                                    type="checkbox"
                                    checked={pair}
                                    onChange={(e) =>
                                        setPairChoice(e.target.checked)
                                    }
                                />
                                <span>
                                    Also fit to the{' '}
                                    {opposite?.label.toLowerCase()}
                                    <small>
                                        Same make, model and weight. Creates two
                                        separate parts, so either can be
                                        replaced on its own.
                                    </small>
                                </span>
                            </label>
                        )}
                    </fieldset>
                )}
                {exemption && (
                    <p className="dialog-description">
                        The {label.toLowerCase()} has been marked none fitted
                        since {formatDate(exemption.startUtc)}. Fitting a part
                        ends that period on the date above.
                    </p>
                )}
                <div className="dialog-actions">
                    <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    {!createdComponentId && (
                        <button
                            className="button primary"
                            type="submit"
                            disabled={busy || !!uncertain}
                        >
                            Fit part
                        </button>
                    )}
                </div>
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
                                        {p.make} {p.model} · {p.id} ·{' '}
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
                                                        setCreatedMake(p.make);
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
