'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    BikeResponse,
    RideResponse,
    ComponentResponse,
    Validated,
    InstallationResponse,
    Position,
    ReminderEvaluation,
} from '@bikelog/api-client';
import { Garage, type GarageProps, type GarageIntegration } from './Garage';
import { BikeForm } from '../bikes/BikeForm';
import { queryKeys } from '../../lib/query';
import { RideForm } from '../rides/RideForm';
import { DeleteRideDialog } from '../rides/DeleteRideDialog';
import { Rides } from '../rides/Rides';
import { Components } from '../components/Components';
import { ComponentPassport } from '../components/ComponentPassport';
import { FitComponentForm } from '../components/FitComponentForm';
import { ReplacementForm } from '../components/ReplacementForm';
import { getApi } from '../../lib/api';
import { EstimateForm } from '../components/EstimateForm';
import { Maintenance } from '../maintenance/Maintenance';
import { MaintenanceForm } from '../maintenance/MaintenanceForm';
import { ReminderCard } from '../reminders/ReminderCard';
import { ReminderForm } from '../reminders/ReminderForm';
import { useReminder } from '../reminders/queries';
import { useOverview } from './queries';
import { Stats } from '../overview/Stats';
import { useBeforeUnload } from '../../lib/useBeforeUnload';
import { Toast } from '../../components/Toast';
function ConnectedStats({ bikeId }: { bikeId: string }) {
    const query = useOverview(bikeId);
    return query.data ? <Stats snapshot={query.data} /> : null;
}
/** Composition seam for the later ride, component, maintenance and reminder screens. */
function SavedNavigation({
    id,
    context,
    onDone,
}: {
    id: string;
    context: GarageIntegration;
    onDone: () => void;
}) {
    useEffect(() => {
        context.requestNavigation(id, context.view);
        onDone();
    }, [id, context, onDone]);
    return null;
}
function ConnectedReminder({
    bikeId,
    context,
    disabled,
    onConfigure,
    onLubricate,
}: {
    bikeId: string;
    context: GarageIntegration;
    disabled: boolean;
    onConfigure: (bikeId: string, e: Validated<ReminderEvaluation>) => void;
    onLubricate: (bikeId: string) => void;
}) {
    const query = useReminder(bikeId);
    if (query.isPending) return <p>Loading reminder…</p>;
    if (query.isError) return <p role="alert">Unable to load reminder.</p>;
    return (
        <ReminderCard
            evaluation={query.data}
            disabled={disabled}
            onConfigure={() =>
                context.requestCancel(() => onConfigure(bikeId, query.data))
            }
            onLubricate={() => context.requestCancel(() => onLubricate(bikeId))}
        />
    );
}
export function Workspace(
    props: Pick<GarageProps, 'renderView' | 'renderReminder'> = {},
) {
    const client = useQueryClient();
    const editorSequence = useRef(0);
    type Editor =
        | {
              kind: 'maintenance';
              bikeId: string;
              presetTaskKey?: 'chain-lubrication';
              key: number;
          }
        | {
              kind: 'reminder';
              bikeId: string;
              evaluation: Validated<ReminderEvaluation>;
              key: number;
          }
        | { kind: 'fit'; bikeId: string; position: Position; key: number }
        | {
              kind: 'replace';
              installation: Validated<InstallationResponse>;
              component: Validated<ComponentResponse>;
              key: number;
          }
        | { kind: 'bike'; bike?: Validated<BikeResponse>; key: number }
        | {
              kind: 'ride';
              bikeId: string;
              ride?: Validated<RideResponse>;
              key: number;
          }
        | { kind: 'delete-ride'; ride: Validated<RideResponse>; key: number }
        | { kind: 'passport'; componentId: string; bikeId: string; key: number }
        | {
              kind: 'estimate';
              component: Validated<ComponentResponse>;
              bikeId: string;
              key: number;
          };
    const [editor, setEditor] = useState<Editor | null>(null);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    useBeforeUnload(!!editor && (dirty || busy));
    const [savedId, setSavedId] = useState<string | null>(null);
    const clearSaved = useCallback(() => setSavedId(null), []);
    const [notice, setNotice] = useState<string | null>(null);
    const close = useCallback(() => {
        setEditor(null);
        setDirty(false);
        setBusy(false);
    }, []);
    const reminderFor = (bikeId: string, context: GarageIntegration) =>
        props.renderReminder?.(bikeId, context) ?? (
            <ConnectedReminder
                key={bikeId}
                bikeId={bikeId}
                context={context}
                disabled={busy}
                onConfigure={(originalId, evaluation) =>
                    setEditor({
                        kind: 'reminder',
                        bikeId: originalId,
                        evaluation,
                        key: ++editorSequence.current,
                    })
                }
                onLubricate={(originalId) =>
                    setEditor({
                        kind: 'maintenance',
                        bikeId: originalId,
                        presetTaskKey: 'chain-lubrication',
                        key: ++editorSequence.current,
                    })
                }
            />
        );
    return (
        <>
            <Garage
                {...props}
                dirty={dirty}
                navigationLocked={busy}
                onExitAccepted={close}
                renderReminder={reminderFor}
                onAction={(action, id) => {
                    if (action === 'create-bike')
                        setEditor({
                            kind: 'bike',
                            key: ++editorSequence.current,
                        });
                    else if (action === 'edit-bike' && id) {
                        const bike = client.getQueryData<
                            Validated<BikeResponse>
                        >(queryKeys.bike(id));
                        if (bike)
                            setEditor({
                                kind: 'bike',
                                bike,
                                key: ++editorSequence.current,
                            });
                    } else if (action === 'log-ride' && id) {
                        setEditor({
                            kind: 'ride',
                            bikeId: id,
                            key: ++editorSequence.current,
                        });
                    } else if (action === 'log-maintenance' && id) {
                        setEditor({
                            kind: 'maintenance',
                            bikeId: id,
                            key: ++editorSequence.current,
                        });
                    } else
                        setNotice(
                            'This form will be connected in the next implementation steps.',
                        );
                }}
                renderView={(context) =>
                    props.renderView?.(context) ?? (
                        <>
                            <ConnectedStats bikeId={context.bikeId!} />
                            {context.view === 'maintenance' &&
                            context.bikeId ? (
                                <div className="content-grid">
                                    <Maintenance
                                        key={`${context.bikeId}-maintenance`}
                                        bikeId={context.bikeId}
                                    />
                                    {reminderFor(context.bikeId, context)}
                                </div>
                            ) : context.view === 'components' &&
                              context.bikeId ? (
                                <Components
                                    key={context.bikeId}
                                    bikeId={context.bikeId}
                                    disabled={busy}
                                    onFit={(position) =>
                                        context.requestCancel(() =>
                                            setEditor({
                                                kind: 'fit',
                                                bikeId: context.bikeId!,
                                                position,
                                                key: ++editorSequence.current,
                                            }),
                                        )
                                    }
                                    onReplace={(installation) =>
                                        context.requestCancel(() => {
                                            const opening =
                                                ++editorSequence.current;
                                            setBusy(true);
                                            void getApi()
                                                .getComponent(
                                                    installation.componentId,
                                                )
                                                .then((component) => {
                                                    setEditor({
                                                        kind: 'replace',
                                                        installation,
                                                        component,
                                                        key: opening,
                                                    });
                                                })
                                                .catch(() =>
                                                    setNotice(
                                                        'Unable to load replacement component.',
                                                    ),
                                                )
                                                .finally(() => setBusy(false));
                                        })
                                    }
                                    onPassport={(componentId) =>
                                        context.requestCancel(() =>
                                            setEditor({
                                                kind: 'passport',
                                                componentId,
                                                bikeId: context.bikeId!,
                                                key: ++editorSequence.current,
                                            }),
                                        )
                                    }
                                />
                            ) : context.view === 'rides' && context.bikeId ? (
                                <Rides
                                    key={context.bikeId}
                                    bikeId={context.bikeId}
                                    disabled={busy}
                                    onEdit={(ride) =>
                                        context.requestCancel(() =>
                                            setEditor({
                                                kind: 'ride',
                                                bikeId: ride.bikeId,
                                                ride,
                                                key: ++editorSequence.current,
                                            }),
                                        )
                                    }
                                    onDelete={(ride) =>
                                        context.requestCancel(() =>
                                            setEditor({
                                                kind: 'delete-ride',
                                                ride,
                                                key: ++editorSequence.current,
                                            }),
                                        )
                                    }
                                />
                            ) : null}
                        </>
                    )
                }
                renderOverlay={(context) =>
                    savedId ? (
                        <SavedNavigation
                            id={savedId}
                            context={context}
                            onDone={clearSaved}
                        />
                    ) : (
                        editor &&
                        (editor.kind === 'maintenance' ? (
                            <MaintenanceForm
                                key={editor.key}
                                bikeId={editor.bikeId}
                                presetTaskKey={editor.presetTaskKey}
                                onDirtyChange={setDirty}
                                onBusyChange={setBusy}
                                onCancel={() => context.requestCancel(close)}
                                onSaved={() => {
                                    close();
                                    setNotice('Maintenance saved.');
                                }}
                            />
                        ) : editor.kind === 'reminder' ? (
                            <ReminderForm
                                key={editor.key}
                                bikeId={editor.bikeId}
                                evaluation={editor.evaluation}
                                onDirtyChange={setDirty}
                                onBusyChange={setBusy}
                                onCancel={() => context.requestCancel(close)}
                                onSaved={() => {
                                    close();
                                    setNotice('Reminder saved.');
                                }}
                            />
                        ) : editor.kind === 'fit' ? (
                            <FitComponentForm
                                key={editor.key}
                                bikeId={editor.bikeId}
                                position={editor.position}
                                onDirtyChange={setDirty}
                                onBusyChange={setBusy}
                                onCancel={() => context.requestCancel(close)}
                                onSaved={() => {
                                    close();
                                    setNotice('Component fitted.');
                                }}
                            />
                        ) : editor.kind === 'replace' ? (
                            <ReplacementForm
                                key={editor.key}
                                installation={editor.installation}
                                component={editor.component}
                                onDirtyChange={setDirty}
                                onBusyChange={setBusy}
                                onCancel={() => context.requestCancel(close)}
                                onSaved={() => {
                                    close();
                                    setNotice(
                                        'Component replaced and service recorded.',
                                    );
                                }}
                            />
                        ) : editor.kind === 'passport' ? (
                            <ComponentPassport
                                key={editor.key}
                                componentId={editor.componentId}
                                selectedBikeId={editor.bikeId}
                                onClose={() => context.requestCancel(close)}
                                onEditEstimate={(component) =>
                                    context.requestCancel(() =>
                                        setEditor({
                                            kind: 'estimate',
                                            component,
                                            bikeId: editor.bikeId,
                                            key: ++editorSequence.current,
                                        }),
                                    )
                                }
                            />
                        ) : editor.kind === 'estimate' ? (
                            <EstimateForm
                                key={editor.key}
                                component={editor.component}
                                onDirtyChange={setDirty}
                                onBusyChange={setBusy}
                                onCancel={() => context.requestCancel(close)}
                                onSaved={() => {
                                    close();
                                    setNotice('Starting estimate saved.');
                                }}
                            />
                        ) : editor.kind === 'ride' ? (
                            <RideForm
                                key={editor.key}
                                bikeId={editor.bikeId}
                                ride={editor.ride}
                                onDirtyChange={setDirty}
                                onBusyChange={setBusy}
                                onCancel={() => context.requestCancel(close)}
                                onSaved={() => {
                                    close();
                                    setNotice('Ride saved.');
                                }}
                            />
                        ) : editor.kind === 'delete-ride' ? (
                            <DeleteRideDialog
                                key={editor.key}
                                ride={editor.ride}
                                onDirtyChange={setDirty}
                                onBusyChange={setBusy}
                                onCancel={() => context.requestCancel(close)}
                                onDeleted={() => {
                                    close();
                                    setNotice('Ride deleted.');
                                }}
                            />
                        ) : (
                            <BikeForm
                                key={editor.key}
                                bike={editor.bike}
                                onDirtyChange={setDirty}
                                onBusyChange={setBusy}
                                onCancel={() => context.requestCancel(close)}
                                onSaved={(bike) => {
                                    close();
                                    setNotice(`${bike.displayName} saved.`);
                                    setSavedId(bike.id);
                                }}
                            />
                        ))
                    )
                }
            />
            <Toast message={notice} />
        </>
    );
}
