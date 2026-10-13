'use client';
import { useState, useEffect, useId } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    ComponentResponse,
    InstallationResponse,
    MoveInstallation,
    ReplaceInstallation,
    ReplaceWithService,
    Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { FormError } from '../../components/FormError';
import { getApi } from '../../lib/api';
import { useMutationRecovery } from '../../lib/mutation';
import {
    formatDate,
    formatLocal,
    preserveOrConvertInstant,
} from '../../lib/dates';
import { formatGrams } from '../../lib/format';
import { parseEuroCost, parseGrams } from '../../lib/units';
import { invalidateBike } from '../../lib/query';
import { PartFields, WhenField, allPages } from './fit-replacement';
import { problemText } from './ActionDialog';
import {
    useComponentCatalog,
    entryOf,
    positionLabel,
    typeLabel,
} from './catalog';
import { useBikes } from '../garage/queries';
type Source = 'new' | 'garage' | 'bike';
type Part = Validated<ComponentResponse>;
/** One replacement request; every kind carries the replaced installation's version. */
type Attempt =
    | { kind: 'new'; input: ReplaceWithService }
    | { kind: 'garage'; input: ReplaceInstallation; label: string }
    | {
          kind: 'bike';
          donorId: string;
          donorBikeId: string;
          input: MoveInstallation;
          label: string;
      };
function versionOf(a: Attempt): number {
    return Number(
        a.kind === 'bike'
            ? (a.input.expectedDestinationInstallationVersion ?? 0)
            : a.input.expectedInstallationVersion,
    );
}
function withVersion(a: Attempt, version: number): Attempt {
    return a.kind === 'bike'
        ? {
              ...a,
              input: {
                  ...a.input,
                  expectedDestinationInstallationVersion: version,
              },
          }
        : a.kind === 'new'
          ? {
                ...a,
                input: { ...a.input, expectedInstallationVersion: version },
            }
          : {
                ...a,
                input: { ...a.input, expectedInstallationVersion: version },
            };
}
export function ReplacementForm({
    installation,
    component,
    onSaved,
    onCancel,
    onDirtyChange,
    onBusyChange,
}: {
    installation: Validated<InstallationResponse>;
    component: Validated<ComponentResponse>;
    onSaved: (r: unknown) => void;
    onCancel: () => void;
    onDirtyChange?: (v: boolean) => void;
    onBusyChange?: (v: boolean) => void;
}) {
    const [original] = useState(installation);
    const [oldPart] = useState(component);
    const [instant] = useState(() => new Date().toISOString());
    const [initial] = useState(() => formatLocal(instant));
    const [wall, setWall] = useState(initial);
    const [make, setMake] = useState('');
    const [model, setModel] = useState('');
    const [weight, setWeight] = useState('');
    const [cost, setCost] = useState('');
    const [offset, setOffset] = useState('');
    const [source, setSource] = useState<Source>('new');
    const [spare, setSpare] = useState('');
    const [donor, setDonor] = useState('');
    const [parts, setParts] = useState<Part[]>([]);
    const [validationAttempt, setValidationAttempt] = useState(0);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<string[]>([]);
    const client = useQueryClient();
    const id = useId();
    const catalog = useComponentCatalog().data;
    const bikes = useBikes();
    const label = positionLabel(catalog, original.position);
    const kind = typeLabel(catalog, oldPart.type);
    const bikeName = (bikeId: string) =>
        bikes.data?.pages.flatMap((p) => p.items).find((b) => b.id === bikeId)
            ?.displayName ?? 'another bike';
    useEffect(() => {
        let active = true;
        allPages((cursor) => getApi().listComponents({ pageSize: 50, cursor }))
            .then((p) => {
                if (active) setParts(p);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);
    const garage = parts.filter(
        (p) =>
            p.type === oldPart.type &&
            p.id !== oldPart.id &&
            p.installations.every((i) => i.endUtc !== null),
    );
    const fittedElsewhere = parts.flatMap((p) => {
        const open = p.installations.find(
            (i) => i.endUtc === null && i.bikeId !== original.bikeId,
        );
        return p.type === oldPart.type && open
            ? [{ part: p, installation: open }]
            : [];
    });
    const chosenDonor = fittedElsewhere.find(
        (d) => d.installation.id === donor,
    );
    const save = useMutationRecovery<Attempt, unknown>(async (attempt) => {
        let newComponentId: string;
        let result: unknown;
        const extraBikes = new Set(oldPart.installations.map((i) => i.bikeId));
        if (attempt.kind === 'new') {
            const r = await getApi().replaceWithService(
                original.id,
                attempt.input,
            );
            newComponentId = r.component.id;
            result = r;
        } else if (attempt.kind === 'garage') {
            result = await getApi().replaceInstallation(
                original.id,
                attempt.input,
            );
            newComponentId = attempt.input.newComponentId;
        } else {
            result = await getApi().moveInstallation(
                attempt.donorId,
                attempt.input,
            );
            newComponentId =
                fittedElsewhere.find(
                    (d) => d.installation.id === attempt.donorId,
                )?.part.id ?? '';
            extraBikes.add(attempt.donorBikeId);
        }
        const ids = [oldPart.id, newComponentId].filter(Boolean);
        await invalidateBike(client, original.bikeId, ids);
        for (const bikeId of extraBikes)
            if (bikeId !== original.bikeId)
                await invalidateBike(client, bikeId, ids);
        return result;
    });
    const busy = save.state.phase === 'saving' || save.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(save.state.phase);
    useEffect(() => {
        onDirtyChange?.(
            !!make ||
                !!model ||
                !!weight ||
                wall !== initial ||
                !!cost ||
                !!spare ||
                !!donor ||
                recovery,
        );
    }, [
        make,
        model,
        weight,
        wall,
        initial,
        cost,
        spare,
        donor,
        recovery,
        onDirtyChange,
    ]);
    useEffect(() => {
        onBusyChange?.(busy);
    }, [busy, onBusyChange]);
    async function refresh() {
        await save.refreshCurrent(() =>
            allPages((cursor) =>
                getApi().listInstallations(original.bikeId, 'all', {
                    pageSize: 50,
                    cursor,
                }),
            ),
        );
    }
    const rows = save.state.current as
        | Awaited<
              ReturnType<ReturnType<typeof getApi>['listInstallations']>
          >['items']
        | undefined;
    const current = rows?.find(
        (r) => r.installation.id === original.id,
    )?.installation;
    const eligible =
        !!current &&
        !current.endUtc &&
        current.componentId === original.componentId &&
        current.position === original.position;
    function finish(result: unknown) {
        if (result !== undefined) {
            onDirtyChange?.(false);
            onSaved(result);
        }
    }
    async function submit() {
        setValidationAttempt((n) => n + 1);
        setFieldErrors({});
        setErrors([]);
        let field = 'date';
        try {
            const at = () =>
                preserveOrConvertInstant(
                    instant,
                    initial,
                    wall,
                    offset || undefined,
                );
            let attempt: Attempt;
            if (source === 'new') {
                field = 'make';
                if (!make.trim()) throw new Error('Enter a make');
                field = 'model';
                if (!model.trim()) throw new Error('Enter a model');
                field = 'weight';
                const grams = parseGrams(weight);
                field = 'cost';
                const amount = parseEuroCost(cost);
                field = 'date';
                attempt = {
                    kind: 'new',
                    input: {
                        newMake: make.trim(),
                        newModel: model.trim(),
                        replacedAtUtc: at(),
                        expectedInstallationVersion: original.version,
                        cost: amount,
                        currency: amount === null ? null : 'EUR',
                        ...(grams === null ? {} : { newWeightGrams: grams }),
                    },
                };
            } else if (source === 'garage') {
                field = 'spare';
                const part = garage.find((p) => p.id === spare);
                if (!part) throw new Error('Choose a part from your garage.');
                field = 'date';
                attempt = {
                    kind: 'garage',
                    label: `${part.make} ${part.model}`,
                    input: {
                        newComponentId: part.id,
                        replacedAtUtc: at(),
                        expectedInstallationVersion: original.version,
                    },
                };
            } else {
                field = 'donor';
                if (!chosenDonor)
                    throw new Error('Choose a part from another bike.');
                field = 'date';
                attempt = {
                    kind: 'bike',
                    label: `${chosenDonor.part.make} ${chosenDonor.part.model}`,
                    donorId: chosenDonor.installation.id,
                    donorBikeId: chosenDonor.installation.bikeId,
                    input: {
                        toBikeId: original.bikeId,
                        toPosition: original.position,
                        movedAtUtc: at(),
                        expectedInstallationVersion:
                            chosenDonor.installation.version,
                        expectedDestinationInstallationVersion:
                            original.version,
                    },
                };
            }
            finish(await save.submit(attempt));
            const after = save.getState();
            if (after.phase === 'validation' && after.error)
                setErrors([problemText(after.error)]);
            if (after.phase === 'conflict') await refresh();
        } catch (e) {
            setFieldErrors({
                [field]: e instanceof Error ? e.message : String(e),
            });
            setErrors([e instanceof Error ? e.message : String(e)]);
        }
    }
    async function retry() {
        if (!eligible || !current || !save.state.attempted) return;
        const input = withVersion(save.state.attempted, current.version);
        finish(
            await (save.state.phase === 'conflict'
                ? save.reapply(input)
                : save.resubmit(input)),
        );
    }
    const attempted = save.state.attempted;
    const weightText = (p: Part) =>
        p.weightGrams === null ? 'No weight' : formatGrams(p.weightGrams);
    return (
        <Dialog
            open
            title={`Replace ${label.toLowerCase()}`}
            onCancel={() => {
                if (!busy) onCancel();
            }}
        >
            <p className="fixed-type">
                Only a {kind} can go here
                {entryOf(catalog, original.position)?.end
                    ? `; front and rear ${kind} parts are interchangeable`
                    : ''}
                .
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
                        ...(save.state.error &&
                        save.state.phase !== 'validation'
                            ? [problemText(save.state.error)]
                            : []),
                        ...(save.state.refreshError
                            ? [save.state.refreshError.message]
                            : []),
                    ]}
                />
                <fieldset className="segmented" disabled={busy || recovery}>
                    <legend className="visually-hidden">
                        Source of the new part
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
                                onChange={() => setSource(value)}
                            />
                            {text}
                            {note && <small>{note}</small>}
                        </label>
                    ))}
                </fieldset>
                <fieldset disabled={busy || recovery}>
                    {source === 'new' ? (
                        <PartFields
                            errors={fieldErrors}
                            make={make}
                            setMake={setMake}
                            model={model}
                            setModel={setModel}
                            weight={weight}
                            setWeight={setWeight}
                            wall={wall}
                            setWall={setWall}
                            offset={offset}
                            setOffset={setOffset}
                            cost={cost}
                            setCost={setCost}
                        />
                    ) : (
                        <>
                            <div
                                className="choice-list"
                                role="radiogroup"
                                aria-label={
                                    source === 'garage'
                                        ? 'Part from your garage'
                                        : 'Part fitted to another bike'
                                }
                            >
                                {source === 'garage' &&
                                    (garage.length === 0 ? (
                                        <p className="empty-choice">
                                            No spare {kind} in your garage.
                                            Choose <strong>New part</strong>, or
                                            take one from another bike.
                                        </p>
                                    ) : (
                                        garage.map((p) => {
                                            const last = p.installations.at(-1);
                                            return (
                                                <label
                                                    className="choice"
                                                    key={p.id}
                                                >
                                                    <input
                                                        type="radio"
                                                        name={`${id}-spare`}
                                                        checked={spare === p.id}
                                                        onChange={() =>
                                                            setSpare(p.id)
                                                        }
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
                                        })
                                    ))}
                                {source === 'bike' &&
                                    (fittedElsewhere.length === 0 ? (
                                        <p className="empty-choice">
                                            No {kind} is fitted to your other
                                            bikes.
                                        </p>
                                    ) : (
                                        fittedElsewhere.map(
                                            ({ part: p, installation: i }) => (
                                                <label
                                                    className="choice"
                                                    key={i.id}
                                                >
                                                    <input
                                                        type="radio"
                                                        name={`${id}-donor`}
                                                        checked={donor === i.id}
                                                        onChange={() =>
                                                            setDonor(i.id)
                                                        }
                                                    />
                                                    <span>
                                                        {p.make} {p.model}
                                                        <small>
                                                            Fitted to{' '}
                                                            {bikeName(i.bikeId)}{' '}
                                                            ·{' '}
                                                            {positionLabel(
                                                                catalog,
                                                                i.position,
                                                            ).toLowerCase()}
                                                        </small>
                                                    </span>
                                                    <span className="meta">
                                                        {weightText(p)}
                                                    </span>
                                                </label>
                                            ),
                                        )
                                    ))}
                            </div>
                            {chosenDonor && source === 'bike' && (
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
                                            catalog,
                                            chosenDonor.installation.position,
                                        ).toLowerCase()}{' '}
                                        from the date below until you fit one.
                                        Rides can still be logged on it.
                                    </p>
                                </div>
                            )}
                            <WhenField
                                label="Replaced on"
                                wall={wall}
                                setWall={setWall}
                                offset={offset}
                                setOffset={setOffset}
                                error={fieldErrors.date}
                            />
                        </>
                    )}
                </fieldset>
                <p className="dialog-description">
                    {oldPart.make} {oldPart.model} comes off and goes to your
                    garage with its history and usage.
                    {source === 'new' &&
                        ' The new part starts with no starting estimate.'}
                </p>
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
                        Replace part
                    </button>
                </div>
            </form>
            {recovery && attempted && (
                <section>
                    <p>
                        {save.state.phase === 'uncertain'
                            ? 'The replacement outcome is uncertain. Review installation history before resubmitting.'
                            : 'This installation changed before your save.'}
                    </p>
                    <p>
                        Your attempted changes:{' '}
                        {attempted.kind === 'new'
                            ? `${attempted.input.newMake} ${attempted.input.newModel}`
                            : attempted.label}{' '}
                        · installation {original.id} · version{' '}
                        {versionOf(attempted)}
                    </p>
                    <button disabled={busy} onClick={() => void refresh()}>
                        Refresh installation history
                    </button>
                    {rows && (
                        <>
                            <p>
                                Current saved installation:{' '}
                                {current
                                    ? `${current.id} · component ${current.componentId} · version ${current.version} · ${current.endUtc ?? 'Open-ended'}`
                                    : 'Original installation unavailable'}
                            </p>
                            {!eligible && (
                                <p>
                                    Already replaced or no longer available.
                                    These changes cannot be reapplied to a
                                    different installation.
                                </p>
                            )}
                            <button
                                disabled={
                                    busy || !eligible || !save.state.refreshed
                                }
                                onClick={() => void retry()}
                            >
                                {save.state.phase === 'conflict'
                                    ? 'Reapply my changes'
                                    : 'Resubmit after review'}
                            </button>
                        </>
                    )}
                </section>
            )}
        </Dialog>
    );
}
