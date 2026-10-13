'use client';
import { errorText } from '../../lib/errors';
import { ReadError } from '../../components/EmptyState';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
    BikeResponse,
    RideResponse,
    ComponentResponse,
    Validated,
    InstallationResponse,
    Position,
    PositionExemptionResponse,
    ReminderEvaluation,
} from '@bikelog/api-client';
import { Garage, type GarageProps, type GarageIntegration } from './Garage';
import { BikeForm } from '../bikes/BikeForm';
import { clearPrivateQueries, queryKeys } from '../../lib/query';
import {
    SessionExpired,
    type AccessIssue,
} from '../../components/SessionExpired';
import { DirtyFormGuard } from '../../components/DirtyFormGuard';
import { RideForm } from '../rides/RideForm';
import { DeleteRideDialog } from '../rides/DeleteRideDialog';
import { Rides } from '../rides/Rides';
import {
    Components,
    type BoardRequest,
    type JustFitted,
} from '../components/Components';
import {
    EditPartDialog,
    EndExemptionDialog,
    ExemptionDialog,
    MoveDialog,
    RemoveDialog,
} from '../components/PositionDialogs';
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
    if (query.isPending) return <p role="status">Loading reminder…</p>;
    if (query.isError)
        return (
            <ReadError
                error={query.error}
                retrying={query.isFetching}
                onRetry={() => void query.refetch()}
            />
        );
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
/** The dialog for one position board action. */
function BoardDialog({
    request,
    bikeId,
    bikeName,
    ...shared
}: {
    request: BoardRequest;
    bikeId: string;
    bikeName: string;
    onSaved: (message: string) => void;
    onCancel: () => void;
    onBusyChange?: (busy: boolean) => void;
    onDirtyChange?: (dirty: boolean) => void;
}) {
    switch (request.kind) {
        case 'remove':
            return (
                <RemoveDialog
                    {...shared}
                    installation={request.installation}
                    component={request.component}
                    bikeName={bikeName}
                />
            );
        case 'move':
            return (
                <MoveDialog
                    {...shared}
                    installation={request.installation}
                    component={request.component}
                />
            );
        case 'exempt':
            return (
                <ExemptionDialog
                    {...shared}
                    bikeId={bikeId}
                    position={request.position}
                    fitted={request.fitted}
                />
            );
        case 'end-exemption':
            return (
                <EndExemptionDialog
                    {...shared}
                    exemption={request.exemption}
                    bikeName={bikeName}
                />
            );
    }
}
export function Workspace(
    props: Pick<GarageProps, 'renderView' | 'renderReminder'> & {
        authenticated?: boolean;
        accessIssue?: AccessIssue | null;
        onAccessIssue?: (issue: AccessIssue | null) => void;
    } = {},
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
        | {
              kind: 'fit';
              bikeId: string;
              position: Position;
              exemption?: Validated<PositionExemptionResponse>;
              /** The date carried over from the previous fit in a "Fit, then …" run. */
              wall?: string;
              offset?: string;
              key: number;
          }
        | { kind: 'board'; bikeId: string; request: BoardRequest; key: number }
        | {
              kind: 'edit-part';
              component: Validated<ComponentResponse>;
              key: number;
          }
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
    const [justFitted, setJustFitted] = useState<JustFitted | null>(null);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmSignOut, setConfirmSignOut] = useState(false);
    useBeforeUnload(!!editor && (dirty || busy));
    useEffect(() => {
        if (props.accessIssue) void clearPrivateQueries(client);
    }, [props.accessIssue, client]);
    const leave = useCallback(() => {
        // One sign-out request at a time; repeated clicks must not race.
        if (signingOut.current) return;
        signingOut.current = true;
        void clearPrivateQueries(client).then(async () => {
            try {
                const response = await fetch('/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                });
                if (!response.ok) throw new Error('Sign-out unavailable');
                const body = (await response.json()) as { logoutUrl?: string };
                if (!body.logoutUrl)
                    throw new Error('Sign-out destination unavailable');
                window.location.replace(body.logoutUrl);
            } catch {
                signingOut.current = false;
                props.onAccessIssue?.('unavailable');
            }
        });
    }, [client, props]);
    const requestSignOut = useCallback(() => {
        if (busy) return;
        if (editor && dirty) setConfirmSignOut(true);
        else leave();
    }, [busy, editor, dirty, leave]);
    const [savedId, setSavedId] = useState<string | null>(null);
    const clearSaved = useCallback(() => setSavedId(null), []);
    const [notice, setNoticeState] = useState<{
        text: string;
        seq: number;
    } | null>(null);
    const setNotice = useCallback(
        (text: string) =>
            setNoticeState((last) => ({ text, seq: (last?.seq ?? 0) + 1 })),
        [],
    );
    const signingOut = useRef(false);
    const close = useCallback(() => {
        setEditor(null);
        setDirty(false);
        setBusy(false);
    }, []);
    const bikeName = (bikeId: string) =>
        client.getQueryData<Validated<BikeResponse>>(queryKeys.bike(bikeId))
            ?.displayName ?? 'This bike';
    const saved = (message: string) => {
        close();
        setNotice(message);
    };
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
    const openComponent = (
        kind: 'replace' | 'passport',
        installation: Validated<InstallationResponse>,
        context: GarageIntegration,
    ) => {
        if (kind === 'passport') {
            context.requestCancel(() =>
                setEditor({
                    kind: 'passport',
                    componentId: installation.componentId,
                    bikeId: installation.bikeId,
                    key: ++editorSequence.current,
                }),
            );
            return;
        }
        context.requestCancel(() => {
            const opening = ++editorSequence.current;
            setBusy(true);
            void getApi()
                .getComponent(installation.componentId)
                .then((component) => {
                    // A later request superseded this one; never open a stale editor.
                    if (opening !== editorSequence.current) return;
                    setEditor({
                        kind: 'replace',
                        installation,
                        component,
                        key: opening,
                    });
                })
                .catch((e) =>
                    setNotice(
                        `The part could not be opened for replacement. ${errorText(e)}`,
                    ),
                )
                .finally(() => setBusy(false));
        });
    };
    return (
        <>
            <div aria-hidden={!!props.accessIssue} inert={!!props.accessIssue}>
                <Garage
                    {...props}
                    onSignOut={props.authenticated ? requestSignOut : undefined}
                    onComponentAction={openComponent}
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
                            else
                                setNotice(
                                    'This bike is still loading. Try Edit bike again in a moment.',
                                );
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
                            setNotice('Select a bike first, then try again.');
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
                                        justFitted={justFitted}
                                        onFit={(position, exemption) =>
                                            context.requestCancel(() =>
                                                setEditor({
                                                    kind: 'fit',
                                                    bikeId: context.bikeId!,
                                                    position,
                                                    exemption,
                                                    key: ++editorSequence.current,
                                                }),
                                            )
                                        }
                                        onRequest={(request) =>
                                            context.requestCancel(() =>
                                                setEditor({
                                                    kind: 'board',
                                                    bikeId: context.bikeId!,
                                                    request,
                                                    key: ++editorSequence.current,
                                                }),
                                            )
                                        }
                                        onEditBike={
                                            context.bike
                                                ? () =>
                                                      context.requestCancel(
                                                          () =>
                                                              setEditor({
                                                                  kind: 'bike',
                                                                  bike: context.bike,
                                                                  key: ++editorSequence.current,
                                                              }),
                                                      )
                                                : undefined
                                        }
                                        onReplace={(installation) =>
                                            openComponent(
                                                'replace',
                                                installation,
                                                context,
                                            )
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
                                ) : context.view === 'rides' &&
                                  context.bikeId ? (
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
                                    onCancel={() =>
                                        context.requestCancel(close)
                                    }
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
                                    onCancel={() =>
                                        context.requestCancel(close)
                                    }
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
                                    exemption={editor.exemption}
                                    initialWall={editor.wall}
                                    initialOffset={editor.offset}
                                    onDirtyChange={setDirty}
                                    onBusyChange={setBusy}
                                    onCancel={() =>
                                        context.requestCancel(() => {
                                            close();
                                            // A chained dialog has no opener left; return to the board.
                                            if (editor.wall !== undefined)
                                                setJustFitted(
                                                    (last) =>
                                                        last && {
                                                            ...last,
                                                            seq: last.seq + 1,
                                                            focus: true,
                                                        },
                                                );
                                        })
                                    }
                                    onSaved={(_, outcome) => {
                                        setJustFitted((last) => ({
                                            bikeId: editor.bikeId,
                                            positions: outcome.positions,
                                            seq: (last?.seq ?? 0) + 1,
                                            focus: !outcome.next,
                                        }));
                                        if (outcome.next) {
                                            setDirty(false);
                                            setBusy(false);
                                            setEditor({
                                                kind: 'fit',
                                                bikeId: editor.bikeId,
                                                position: outcome.next.position,
                                                wall: outcome.next.wall,
                                                offset: outcome.next.offset,
                                                key: ++editorSequence.current,
                                            });
                                        } else close();
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
                                    onCancel={() =>
                                        context.requestCancel(close)
                                    }
                                    onSaved={() => {
                                        close();
                                        setNotice('Part replaced.');
                                    }}
                                />
                            ) : editor.kind === 'passport' ? (
                                <ComponentPassport
                                    key={editor.key}
                                    componentId={editor.componentId}
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
                                    onEditDetails={(component) =>
                                        setEditor({
                                            kind: 'edit-part',
                                            component,
                                            key: ++editorSequence.current,
                                        })
                                    }
                                    onMove={(installation, component) =>
                                        setEditor({
                                            kind: 'board',
                                            bikeId: installation.bikeId,
                                            request: {
                                                kind: 'move',
                                                installation,
                                                component,
                                            },
                                            key: ++editorSequence.current,
                                        })
                                    }
                                    onRemove={(installation, component) =>
                                        setEditor({
                                            kind: 'board',
                                            bikeId: installation.bikeId,
                                            request: {
                                                kind: 'remove',
                                                installation,
                                                component,
                                            },
                                            key: ++editorSequence.current,
                                        })
                                    }
                                />
                            ) : editor.kind === 'edit-part' ? (
                                <EditPartDialog
                                    key={editor.key}
                                    component={editor.component}
                                    affectedBikeIds={[
                                        ...new Set(
                                            editor.component.installations.map(
                                                (i) => i.bikeId,
                                            ),
                                        ),
                                    ]}
                                    onDirtyChange={setDirty}
                                    onBusyChange={setBusy}
                                    onCancel={() =>
                                        context.requestCancel(close)
                                    }
                                    onSaved={saved}
                                />
                            ) : editor.kind === 'board' ? (
                                <BoardDialog
                                    key={editor.key}
                                    request={editor.request}
                                    bikeId={editor.bikeId}
                                    bikeName={bikeName(editor.bikeId)}
                                    onDirtyChange={setDirty}
                                    onBusyChange={setBusy}
                                    onCancel={() =>
                                        context.requestCancel(close)
                                    }
                                    onSaved={saved}
                                />
                            ) : editor.kind === 'estimate' ? (
                                <EstimateForm
                                    key={editor.key}
                                    component={editor.component}
                                    onDirtyChange={setDirty}
                                    onBusyChange={setBusy}
                                    onCancel={() =>
                                        context.requestCancel(close)
                                    }
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
                                    onCancel={() =>
                                        context.requestCancel(close)
                                    }
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
                                    onCancel={() =>
                                        context.requestCancel(close)
                                    }
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
                                    onCancel={() =>
                                        context.requestCancel(close)
                                    }
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
            </div>
            {props.accessIssue && (
                <SessionExpired
                    reason={props.accessIssue}
                    onLeave={leave}
                    onRetry={() => props.onAccessIssue?.(null)}
                />
            )}
            {confirmSignOut && (
                <DirtyFormGuard
                    dirty
                    onStay={() => setConfirmSignOut(false)}
                    onDiscard={() => {
                        setConfirmSignOut(false);
                        close();
                        leave();
                    }}
                />
            )}
            <Toast message={notice?.text ?? null} seq={notice?.seq} />
        </>
    );
}
