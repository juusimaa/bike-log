'use client';
import { errorText } from '../../lib/errors';
import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    BikeResponse,
    ComponentResponse,
    InstallationResponse,
    PositionExemptionResponse,
    Validated,
} from '@bikelog/api-client';
import { getApi } from '../../lib/api';
import { invalidateBike, queryKeys } from '../../lib/query';
import { formatLocal, toUtc, formatDate } from '../../lib/dates';
import { formatKilometres } from '../../lib/format';
import { parseGrams } from '../../lib/units';
import { Field } from '../../components/Field';
import { ActionDialog, FieldProblem } from './ActionDialog';
import { WhenField, WeightField, allPages } from './fit-replacement';
import {
    useComponentCatalog,
    positionLabel,
    typeLabel,
    type Catalog,
} from './catalog';
import { useAllBikes, useOverview } from '../garage/queries';
type Installation = Validated<InstallationResponse>;
type Component = Validated<ComponentResponse>;
type Exemption = Validated<PositionExemptionResponse>;
type Shared = {
    onSaved: (message: string) => void;
    onCancel: () => void;
    onBusyChange?: (busy: boolean) => void;
    onDirtyChange?: (dirty: boolean) => void;
};
function useWhen() {
    const [initial] = useState(() => formatLocal(new Date().toISOString()));
    const [wall, setWall] = useState(initial);
    const [offset, setOffset] = useState('');
    return {
        wall,
        setWall,
        offset,
        setOffset,
        dirty: wall !== initial,
        instant(): string {
            try {
                return toUtc(wall, offset || undefined);
            } catch (e) {
                throw new FieldProblem('date', errorText(e));
            }
        },
    };
}
async function freshInstallation(
    componentId: string,
    installationId: string,
): Promise<Installation | undefined> {
    return (await getApi().getComponent(componentId)).installations.find(
        (i) => i.id === installationId,
    );
}
function InstallationState({ current }: { current: unknown }) {
    const i = current as Installation | undefined;
    return i ? (
        <p>
            Installation version {i.version} · {i.endUtc ? 'ended' : 'fitted'}{' '}
            since {formatDate(i.startUtc)}
        </p>
    ) : (
        <p>The installation is no longer available.</p>
    );
}
async function invalidate(
    client: ReturnType<typeof useQueryClient>,
    bikeIds: string[],
    componentIds: string[],
) {
    for (const bikeId of new Set(bikeIds))
        await invalidateBike(client, bikeId, componentIds);
}
/** Ends a fitted part's installation; the part returns to the garage. */
export function RemoveDialog({
    installation,
    component,
    bikeName,
    ...shared
}: Shared & {
    installation: Installation;
    component: Component;
    bikeName: string;
}) {
    const client = useQueryClient();
    const catalog = useComponentCatalog().data;
    const when = useWhen();
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const label = positionLabel(catalog, installation.position).toLowerCase();
    return (
        <ActionDialog
            {...shared}
            title={`Remove ${label}`}
            submitLabel="Remove part"
            dirty={when.dirty}
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            build={() => ({
                startUtc: installation.startUtc,
                endUtc: when.instant(),
                expectedVersion: installation.version,
            })}
            send={async (input) => {
                const result = await getApi().correctInstallation(
                    installation.id,
                    input,
                );
                await invalidate(client, [installation.bikeId], [component.id]);
                return result;
            }}
            refresh={() => freshInstallation(component.id, installation.id)}
            rebase={(input, current) => {
                const i = current as Installation | undefined;
                return i && !i.endUtc
                    ? { ...input, expectedVersion: i.version }
                    : null;
            }}
            describe={(current) => <InstallationState current={current} />}
            onSaved={() =>
                shared.onSaved(
                    `${component.make} ${component.model} removed. It is in your garage.`,
                )
            }
        >
            <p className="dialog-description">
                {component.make} {component.model} goes to your garage with its
                history and usage. You can fit it again later, to any bike.
            </p>
            <WhenField label="Removed on" {...when} error={fieldErrors.date} />
            <div className="notice inline" role="note">
                <p>
                    <strong>{bikeName} will be incomplete</strong> until you fit
                    another {typeLabel(catalog, component.type)}. Rides can
                    still be logged; they will show a gap.
                </p>
            </div>
        </ActionDialog>
    );
}
/**
 * Declares a position intentionally empty from a date (front derailleur none fitted, or a
 * tubeless wheel). A fitted part there is ended by the API with the version shown here.
 */
export function ExemptionDialog({
    bikeId,
    position,
    fitted,
    ...shared
}: Shared & {
    bikeId: string;
    position: string;
    fitted?: { installation: Installation; component: Component };
}) {
    const client = useQueryClient();
    const catalog = useComponentCatalog().data;
    const entry = catalog?.positions.find((p) => p.position === position);
    const when = useWhen();
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const tubeless = entry?.exemption === 'tubeless';
    const label = positionLabel(catalog, position).toLowerCase();
    const wheel = `${entry?.end ?? ''} wheel`.trim();
    return (
        <ActionDialog
            {...shared}
            title={
                tubeless
                    ? `Switch ${wheel} to tubeless`
                    : `Mark ${label} as none fitted`
            }
            submitLabel={tubeless ? 'Switch to tubeless' : 'Mark none fitted'}
            dirty={when.dirty}
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            build={() => ({
                position,
                startUtc: when.instant(),
                expectedInstallationVersion: fitted?.installation.version,
            })}
            send={async (input) => {
                const result = await getApi().createExemption(bikeId, input);
                await invalidate(
                    client,
                    [bikeId],
                    fitted ? [fitted.component.id] : [],
                );
                return result;
            }}
            refresh={async () =>
                fitted
                    ? freshInstallation(
                          fitted.component.id,
                          fitted.installation.id,
                      )
                    : undefined
            }
            rebase={(input, current) => {
                const i = current as Installation | undefined;
                return i && !i.endUtc
                    ? { ...input, expectedInstallationVersion: i.version }
                    : null;
            }}
            describe={(current) => <InstallationState current={current} />}
            onSaved={() =>
                shared.onSaved(
                    tubeless
                        ? `${entry?.end === 'front' ? 'Front' : 'Rear'} wheel is tubeless.`
                        : `${positionLabel(catalog, position)} marked as none fitted.`,
                )
            }
        >
            {!tubeless && (
                <p className="dialog-description">
                    For a 1x drivetrain. From this date the position gets no
                    usage and shows no gaps, and the bike is not counted as
                    incomplete.
                </p>
            )}
            <WhenField label="From" {...when} error={fieldErrors.date} />
            {fitted ? (
                <p className="dialog-description">
                    {fitted.component.make} {fitted.component.model} comes off
                    and goes to your garage with its history and usage.
                    {tubeless &&
                        ` While tubeless, the ${label} is not applicable and shows no gaps.`}
                </p>
            ) : (
                tubeless && (
                    <p className="dialog-description">
                        While tubeless, the {label} is not applicable and shows
                        no gaps.
                    </p>
                )
            )}
        </ActionDialog>
    );
}
/** Ends an intentionally empty period: the position needs a part again from that date. */
export function EndExemptionDialog({
    exemption,
    bikeName,
    ...shared
}: Shared & { exemption: Exemption; bikeName: string }) {
    const client = useQueryClient();
    const catalog = useComponentCatalog().data;
    const entry = catalog?.positions.find(
        (p) => p.position === exemption.position,
    );
    const when = useWhen();
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const tubeless = exemption.reason === 'tubeless';
    const label = positionLabel(catalog, exemption.position).toLowerCase();
    return (
        <ActionDialog
            {...shared}
            title={
                tubeless
                    ? `Switch ${entry?.end ?? ''} wheel to tubed`.replace(
                          '  ',
                          ' ',
                      )
                    : `End “none fitted” for the ${label}`
            }
            submitLabel={tubeless ? 'Switch to tubed' : 'End none fitted'}
            dirty={when.dirty}
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            build={() => ({
                startUtc: exemption.startUtc,
                endUtc: when.instant(),
                expectedVersion: exemption.version,
            })}
            send={async (input) => {
                const result = await getApi().correctExemption(
                    exemption.id,
                    input,
                );
                await invalidate(client, [exemption.bikeId], []);
                return result;
            }}
            refresh={async () =>
                (await getApi().listExemptions(exemption.bikeId)).find(
                    (x) => x.id === exemption.id,
                )
            }
            rebase={(input, current) => {
                const e = current as Exemption | undefined;
                return e && !e.endUtc
                    ? { ...input, expectedVersion: e.version }
                    : null;
            }}
            describe={(current) => {
                const e = current as Exemption | undefined;
                return e ? (
                    <p>
                        Since {formatDate(e.startUtc)}
                        {e.endUtc ? ` until ${formatDate(e.endUtc)}` : ''} ·
                        version {e.version}
                    </p>
                ) : (
                    <p>The period is no longer available.</p>
                );
            }}
            onSaved={() =>
                shared.onSaved(
                    tubeless
                        ? `Wheel is tubed. Fit a tube to complete the bike.`
                        : `Fit a ${label} to complete the bike.`,
                )
            }
        >
            <WhenField label="From" {...when} error={fieldErrors.date} />
            <div className="notice inline" role="note">
                <p>
                    The {label} will be <strong>missing</strong> until you fit
                    one, and {bikeName} will be incomplete. Rides can still be
                    logged.
                </p>
            </div>
        </ActionDialog>
    );
}
/** Moves a fitted part to another bike or position in one API call. */
export function MoveDialog({
    installation,
    component,
    ...shared
}: Shared & {
    installation: Installation;
    component: Component;
}) {
    const client = useQueryClient();
    const bikePages = useAllBikes();
    const bikes = bikePages.data?.pages.flatMap((p) => p.items) ?? [];
    const catalog = useComponentCatalog().data;
    const id = useId();
    const when = useWhen();
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [picked, setToBikeId] = useState('');
    const toBikeId =
        picked ||
        (bikes.find((b) => b.id !== installation.bikeId)?.id ??
            installation.bikeId);
    const targets = (catalog?.positions ?? []).filter(
        (p) =>
            p.type === component.type &&
            !(
                toBikeId === installation.bikeId &&
                p.position === installation.position
            ),
    );
    const [chosen, setChosen] = useState<string>('');
    const toPosition = targets.some((t) => t.position === chosen)
        ? chosen
        : (targets.find((t) => t.position === installation.position)
              ?.position ??
          targets[0]?.position ??
          '');
    const destination = useOverview(toBikeId);
    const status = destination.data?.positionStatuses.find(
        (s) => s.position === toPosition,
    );
    const occupantPart = useQuery({
        queryKey: queryKeys.component(status?.componentId ?? ''),
        enabled: status?.state === 'fitted' && !!status.componentId,
        queryFn: ({ signal }) =>
            getApi().getComponent(status!.componentId!, signal),
    });
    const occupantInstallation =
        status?.state === 'fitted'
            ? occupantPart.data?.installations.find(
                  (x) => x.id === status.installationId,
              )
            : undefined;
    const occupant =
        occupantInstallation && occupantPart.data
            ? {
                  installation: occupantInstallation,
                  component: occupantPart.data,
              }
            : null;
    const name = (bikeId: string) =>
        bikes.find((b) => b.id === bikeId)?.displayName ?? 'this bike';
    const stateText = (position: string) => {
        const s = destination.data?.positionStatuses.find(
            (x) => x.position === position,
        );
        if (!s) return 'checking…';
        if (s.state === 'fitted') return 'fitted';
        if (s.state === 'exempt')
            return s.reason === 'tubeless' ? 'tubeless' : 'none fitted';
        return s.state === 'missing' ? 'missing' : 'empty';
    };
    type Input = Parameters<ReturnType<typeof getApi>['moveInstallation']>[1];
    return (
        <ActionDialog<
            Input,
            Awaited<ReturnType<ReturnType<typeof getApi>['moveInstallation']>>
        >
            {...shared}
            title={`Move ${component.make} ${component.model}`}
            submitLabel="Move part"
            dirty={when.dirty || !!chosen}
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            build={() => {
                if (!toPosition)
                    throw new FieldProblem(
                        'position',
                        'Choose a position for this part.',
                    );
                if (status?.state === 'fitted' && !occupant)
                    throw new Error(
                        'Still checking the part in that position. Try again.',
                    );
                return {
                    toBikeId,
                    toPosition,
                    movedAtUtc: when.instant(),
                    expectedInstallationVersion: installation.version,
                    expectedDestinationInstallationVersion:
                        occupant?.installation.version,
                };
            }}
            send={async (input) => {
                const result = await getApi().moveInstallation(
                    installation.id,
                    input,
                );
                await invalidate(
                    client,
                    [installation.bikeId, toBikeId],
                    [
                        component.id,
                        ...(occupant ? [occupant.component.id] : []),
                    ],
                );
                return result;
            }}
            refresh={async () => ({
                source: await freshInstallation(component.id, installation.id),
                destination: (
                    await allPages((cursor) =>
                        getApi().listInstallations(toBikeId, 'current', {
                            pageSize: 50,
                            cursor,
                        }),
                    )
                ).find((r) => r.installation.position === toPosition)
                    ?.installation,
            })}
            rebase={(input, current) => {
                const c = current as {
                    source?: Installation;
                    destination?: Installation;
                };
                if (!c.source || c.source.endUtc) return null;
                return {
                    ...input,
                    expectedInstallationVersion: c.source.version,
                    expectedDestinationInstallationVersion:
                        c.destination?.version,
                };
            }}
            describe={(current) => {
                const c = current as {
                    source?: Installation;
                    destination?: Installation;
                };
                return (
                    <>
                        <InstallationState current={c.source} />
                        <p>
                            {c.destination
                                ? `The ${positionLabel(catalog, toPosition).toLowerCase()} on ${name(toBikeId)} is fitted (version ${c.destination.version}); it would go to your garage.`
                                : `The ${positionLabel(catalog, toPosition).toLowerCase()} on ${name(toBikeId)} is empty.`}
                        </p>
                    </>
                );
            }}
            onSaved={() =>
                shared.onSaved(
                    `${component.make} ${component.model} is now the ${positionLabel(catalog, toPosition).toLowerCase()} on ${name(toBikeId)}.`,
                )
            }
        >
            <MoveFields
                id={id}
                catalog={catalog}
                bikes={bikes}
                toBikeId={toBikeId}
                setToBikeId={(v) => {
                    setToBikeId(v);
                    setChosen('');
                }}
                targets={targets.map((t) => ({
                    position: t.position,
                    label: `${t.label} — ${stateText(t.position)}`,
                }))}
                toPosition={toPosition}
                setPosition={setChosen}
                error={fieldErrors.position}
            />
            <p className="dialog-description">
                Currently the{' '}
                {positionLabel(catalog, installation.position).toLowerCase()} on{' '}
                {name(installation.bikeId)}. Its history and usage move with it.
            </p>
            <WhenField label="Moved on" {...when} error={fieldErrors.date} />
            {occupant && (
                <p className="dialog-description">
                    {occupant.component.make} {occupant.component.model} comes
                    off {name(toBikeId)} and goes to your garage.
                </p>
            )}
            {status?.state === 'exempt' && (
                <p className="dialog-description">
                    {status.reason === 'tubeless'
                        ? 'This wheel is tubeless. Switch it to tubed before fitting a tube.'
                        : 'This position is marked none fitted. End that first.'}
                </p>
            )}
            {toBikeId !== installation.bikeId && (
                <div className="notice inline" role="note">
                    <p>
                        <strong>
                            {name(installation.bikeId)} will be incomplete
                        </strong>{' '}
                        until you fit another{' '}
                        {typeLabel(catalog, component.type)}. Rides can still be
                        logged on it.
                    </p>
                </div>
            )}
        </ActionDialog>
    );
}
function MoveFields({
    id,
    bikes,
    toBikeId,
    setToBikeId,
    targets,
    toPosition,
    setPosition,
    error,
}: {
    id: string;
    catalog: Catalog | undefined;
    bikes: Validated<BikeResponse>[];
    toBikeId: string;
    setToBikeId: (v: string) => void;
    targets: { position: string; label: string }[];
    toPosition: string;
    setPosition: (v: string) => void;
    error?: string;
}) {
    return (
        <>
            <Field id={`${id}-bike`} label="Bike">
                <select
                    value={toBikeId}
                    onChange={(e) => setToBikeId(e.target.value)}
                >
                    {bikes.map((b) => (
                        <option key={b.id} value={b.id}>
                            {b.displayName}
                        </option>
                    ))}
                </select>
            </Field>
            <Field id={`${id}-position`} label="Position" error={error}>
                <select
                    value={toPosition}
                    onChange={(e) => setPosition(e.target.value)}
                >
                    {targets.map((t) => (
                        <option key={t.position} value={t.position}>
                            {t.label}
                        </option>
                    ))}
                </select>
            </Field>
        </>
    );
}
/** Make, model and weight. Type, history and usage never change here. */
export function EditPartDialog({
    component,
    affectedBikeIds,
    ...shared
}: Shared & { component: Component; affectedBikeIds: string[] }) {
    const client = useQueryClient();
    const catalog = useComponentCatalog().data;
    const id = useId();
    const [make, setMake] = useState(component.make);
    const [model, setModel] = useState(component.model);
    const [weight, setWeight] = useState(
        component.weightGrams === null ? '' : String(component.weightGrams),
    );
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    return (
        <ActionDialog
            {...shared}
            title="Edit part details"
            submitLabel="Save details"
            dirty={
                make !== component.make ||
                model !== component.model ||
                weight !==
                    (component.weightGrams === null
                        ? ''
                        : String(component.weightGrams))
            }
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            build={() => {
                if (!make.trim())
                    throw new FieldProblem('make', 'Enter the make.');
                if (!model.trim())
                    throw new FieldProblem('model', 'Enter the model.');
                let weightGrams: number | null;
                try {
                    weightGrams = parseGrams(weight);
                } catch (e) {
                    throw new FieldProblem('weight', errorText(e));
                }
                return {
                    make: make.trim(),
                    model: model.trim(),
                    weightGrams,
                    expectedVersion: component.version,
                };
            }}
            send={async (input) => {
                const result = await getApi().editComponent(
                    component.id,
                    input,
                );
                await invalidate(client, affectedBikeIds, [component.id]);
                return result;
            }}
            refresh={() => getApi().getComponent(component.id)}
            rebase={(input, current) => ({
                ...input,
                expectedVersion: (current as Component).version,
            })}
            describe={(current) => {
                const c = current as Component;
                return (
                    <p>
                        {c.make} {c.model} ·{' '}
                        {c.weightGrams === null
                            ? 'weight not recorded'
                            : `${c.weightGrams} g`}{' '}
                        · version {c.version}
                    </p>
                );
            }}
            onSaved={() => shared.onSaved('Part details saved.')}
        >
            <p className="fixed-type">
                Type: {typeLabel(catalog, component.type)} (cannot be changed)
            </p>
            <Field id={`${id}-make`} label="Make" error={fieldErrors.make}>
                <input
                    value={make}
                    maxLength={100}
                    onChange={(e) => setMake(e.target.value)}
                />
            </Field>
            <Field id={`${id}-model`} label="Model" error={fieldErrors.model}>
                <input
                    value={model}
                    maxLength={100}
                    onChange={(e) => setModel(e.target.value)}
                />
            </Field>
            <WeightField
                value={weight}
                setValue={setWeight}
                error={fieldErrors.weight}
            />
            <p className="dialog-description">
                Editing details never changes the part&rsquo;s history or usage
                ({formatKilometres(component.initialUsageEstimateMetres)} km
                starting estimate stays as it is).
            </p>
        </ActionDialog>
    );
}
