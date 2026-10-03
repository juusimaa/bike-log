'use client';
import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    ComponentResponse,
    InstallationResponse,
    ReplaceWithService,
    ReplacementWithServiceResponse,
    Validated,
} from '@bikelog/api-client';
import { Dialog } from '../../components/Dialog';
import { FormError } from '../../components/FormError';
import { getApi } from '../../lib/api';
import { useMutationRecovery } from '../../lib/mutation';
import { formatLocal, preserveOrConvertInstant } from '../../lib/dates';
import { parseEuroCost } from '../../lib/units';
import { invalidateBike } from '../../lib/query';
import { PartFields, allPages } from './fit-replacement';
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
    onSaved: (r: Validated<ReplacementWithServiceResponse>) => void;
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
    const [cost, setCost] = useState('');
    const [offset, setOffset] = useState('');
    const [validationAttempt, setValidationAttempt] = useState(0);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<string[]>([]);
    const client = useQueryClient();
    const save = useMutationRecovery<
        ReplaceWithService,
        Validated<ReplacementWithServiceResponse>
    >(async (input) => {
        const result = await getApi().replaceWithService(original.id, input);
        await invalidateBike(client, original.bikeId, [
            oldPart.id,
            result.component.id,
        ]);
        for (const bikeId of new Set(
            oldPart.installations.map((i) => i.bikeId),
        ))
            if (bikeId !== original.bikeId)
                await invalidateBike(client, bikeId, [
                    oldPart.id,
                    result.component.id,
                ]);
        return result;
    });
    const busy = save.state.phase === 'saving' || save.state.refreshing;
    const recovery = ['conflict', 'uncertain'].includes(save.state.phase);
    useEffect(() => {
        onDirtyChange?.(
            !!make || !!model || wall !== initial || !!cost || recovery,
        );
    }, [make, model, wall, initial, cost, recovery, onDirtyChange]);
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
    async function finish(
        result: Validated<ReplacementWithServiceResponse> | undefined,
    ) {
        if (result) {
            onDirtyChange?.(false);
            onSaved(result);
        }
    }
    async function submit() {
        setValidationAttempt((n) => n + 1);
        setFieldErrors({});
        setErrors([]);
        let field = 'make';
        try {
            if (!make.trim()) throw new Error('Enter a make');
            field = 'model';
            if (!model.trim()) throw new Error('Enter a model');
            field = 'cost';
            const amount = parseEuroCost(cost);
            field = 'date';
            const input = {
                newMake: make.trim(),
                newModel: model.trim(),
                replacedAtUtc: preserveOrConvertInstant(
                    instant,
                    initial,
                    wall,
                    offset || undefined,
                ),
                expectedInstallationVersion: original.version,
                cost: amount,
                currency: amount === null ? null : 'EUR',
            };
            await finish(await save.submit(input));
            if (save.getState().phase === 'conflict') await refresh();
        } catch (e) {
            setFieldErrors({
                [field]: e instanceof Error ? e.message : String(e),
            });
            setErrors([String(e)]);
        }
    }
    async function retry() {
        if (!eligible || !current || !save.state.attempted) return;
        const input = {
            ...save.state.attempted,
            expectedInstallationVersion: current.version,
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
            title={`Replace ${original.position}`}
            onCancel={() => {
                if (!busy) onCancel();
            }}
        >
            <p>
                Old component {oldPart.make} {oldPart.model} · {oldPart.id}. The
                new component starts with a zero starting estimate.
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
                    <PartFields
                        errors={fieldErrors}
                        make={make}
                        setMake={setMake}
                        model={model}
                        setModel={setModel}
                        wall={wall}
                        setWall={setWall}
                        offset={offset}
                        setOffset={setOffset}
                        cost={cost}
                        setCost={setCost}
                    />
                    <button type="submit">Replace component</button>
                </fieldset>
                <button type="button" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </form>
            {recovery && (
                <section>
                    <p>
                        {save.state.phase === 'uncertain'
                            ? 'The replacement outcome is uncertain. Review installation history before resubmitting.'
                            : 'This installation changed before your save.'}
                    </p>
                    <p>
                        Your attempted changes: {save.state.attempted?.newMake}{' '}
                        {save.state.attempted?.newModel} · installation{' '}
                        {original.id} · version{' '}
                        {save.state.attempted?.expectedInstallationVersion} ·{' '}
                        {save.state.attempted?.replacedAtUtc}
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
