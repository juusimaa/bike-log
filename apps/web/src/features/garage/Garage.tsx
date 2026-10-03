'use client';
import {
    useState,
    useEffect,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import type { Uuid, View, BikeResponse, Validated } from '@bikelog/api-client';
import { ApiError } from '@bikelog/api-client';
import { AppShell, viewTitles } from '../../components/AppShell';
import { BikeSelector } from '../../components/BikeSelector';
import { EmptyState, ReadError } from '../../components/EmptyState';
import { DirtyFormGuard } from '../../components/DirtyFormGuard';
import { Overview } from '../overview/Overview';
import { useBike, useBikes } from './queries';
import { readSelection, selectionUrl } from './navigation';
export type GarageAction =
    'create-bike' | 'edit-bike' | 'log-ride' | 'log-maintenance';
export type GarageIntegration = {
    bikeId: Uuid | null;
    bike: Validated<BikeResponse> | undefined;
    view: View;
    requestNavigation: (bikeId: Uuid | null, view: View) => void;
    requestCancel: (cancel: () => void) => void;
};
export type GarageProps = {
    dirty?: boolean;
    navigationLocked?: boolean;
    onExitAccepted?: () => void;
    onAction?: (action: GarageAction, originalBikeId: Uuid | null) => void;
    renderView?: (context: GarageIntegration) => ReactNode;
    renderOverlay?: (context: GarageIntegration) => ReactNode;
    renderReminder?: (bikeId: Uuid, context: GarageIntegration) => ReactNode;
};
// Traversal bookkeeping lives in event callbacks; it never changes rendered data.
function createHistoryTraversal() {
    let index = 0,
        restoring = false,
        accepting = false;
    return {
        index: () => index,
        setIndex: (next: number) => {
            index = next;
        },
        nextIndex: () => ++index,
        restore: () => {
            restoring = true;
        },
        accept: () => {
            accepting = true;
        },
        consumeRestore: () => {
            const value = restoring;
            restoring = false;
            return value;
        },
        consumeAccept: () => {
            const value = accepting;
            accepting = false;
            return value;
        },
    };
}
const subscribeHydration = () => () => {};
export function Garage({
    dirty = false,
    navigationLocked = false,
    onExitAccepted,
    onAction,
    renderView,
    renderOverlay,
    renderReminder,
}: GarageProps = {}) {
    const hydrated = useSyncExternalStore(
        subscribeHydration,
        () => true,
        () => false,
    );
    const [history] = useState(createHistoryTraversal);
    useEffect(() => {
        const index = window.history.state?.bikeLogIndex ?? 0;
        history.setIndex(index);
        window.history.replaceState(
            { ...window.history.state, bikeLogIndex: index },
            '',
            window.location.href,
        );
    }, [history]);
    const [notice, setNotice] = useState<string | null>(null);
    const [search, setSearch] = useState(() =>
        typeof window === 'undefined' ? '' : window.location.search,
    );
    const [pending, setPending] = useState<null | (() => void)>(null);
    const bikes = useBikes();
    const selection = readSelection(
        new URLSearchParams(hydrated ? search : ''),
    );
    const supplied = new URLSearchParams(hydrated ? search : '').has('bike');
    const all = Array.from(
        new Map(
            bikes.data?.pages.flatMap((p) => p.items).map((b) => [b.id, b]),
        ).values(),
    );
    const bikeId = selection.bikeId ?? (supplied ? null : (all[0]?.id ?? null));
    const bike = useBike(bikeId);
    const view = selection.view;
    function action(kind: GarageAction, id: Uuid | null) {
        if (onAction) request(() => onAction(kind, id));
        else
            setNotice(
                'This form will be connected in the next implementation steps.',
            );
    }
    const request = (action: () => void) => {
        if (navigationLocked) return;
        const accept = () => {
            onExitAccepted?.();
            action();
        };
        if (dirty) setPending(() => accept);
        else accept();
    };
    function navigate(id: Uuid | null, next: View) {
        request(() => {
            const url = selectionUrl(id, next);
            window.history.pushState(
                { bikeLogIndex: history.nextIndex() },
                '',
                url,
            );
            setSearch(window.location.search);
        });
    }
    useEffect(() => {
        const back = () => {
            if (history.consumeRestore()) {
                return;
            }
            const next = window.location.search;
            const index = window.history.state?.bikeLogIndex ?? 0;
            const delta = index - history.index();
            if (history.consumeAccept()) {
                history.setIndex(index);
                onExitAccepted?.();
                setSearch(next);
            } else if (navigationLocked || dirty) {
                if (delta) {
                    history.restore();
                    window.history.go(-delta);
                }
                if (dirty && !navigationLocked)
                    setPending(() => () => {
                        history.accept();
                        window.history.go(delta);
                    });
            } else {
                history.setIndex(index);
                onExitAccepted?.();
                setSearch(next);
            }
        };
        window.addEventListener('popstate', back);
        return () => window.removeEventListener('popstate', back);
    }, [dirty, navigationLocked, onExitAccepted, bikeId, view, history]);
    useEffect(() => {
        if (!supplied && bikeId) {
            window.history.replaceState(
                { ...window.history.state, bikeLogIndex: history.index() },
                '',
                selectionUrl(bikeId, view),
            );
        }
    }, [supplied, bikeId, view, history]);
    const context: GarageIntegration = {
        bikeId,
        bike: bike.data,
        view,
        requestNavigation: navigate,
        requestCancel: request,
    };
    const missing =
        (supplied && !selection.bikeId) ||
        (bike.error instanceof ApiError &&
            (bike.error.status === 404 || bike.error.status === 403));
    const usable = !!bike.data && !bike.error;
    return (
        <AppShell
            view={view}
            navigationLocked={navigationLocked}
            onNavigate={(v) => navigate(bikeId, v)}
            hrefFor={(v) => selectionUrl(bikeId, v)}
        >
            <div className="page-heading">
                <div>
                    <p className="eyebrow">YOUR GARAGE</p>
                    <h1>
                        {
                            {
                                overview: 'Your garage, in good order.',
                                components: 'Every part has a story.',
                                rides: 'Miles worth remembering.',
                                maintenance: 'Care that goes the distance.',
                            }[view]
                        }
                    </h1>
                    <p>
                        {
                            {
                                overview:
                                    'A little attention today. A better ride tomorrow.',
                                components:
                                    'See what’s fitted, what’s been replaced, and the miles in between.',
                                rides: 'Your rides, and the components that came along.',
                                maintenance:
                                    'A useful history of the little things that keep you rolling.',
                            }[view]
                        }
                    </p>
                </div>
                <div className="heading-actions">
                    <button
                        className="button secondary"
                        disabled={!usable || navigationLocked}
                        onClick={() => action('log-maintenance', bikeId)}
                    >
                        Log maintenance
                    </button>
                    <button
                        className="button primary"
                        disabled={!usable || navigationLocked}
                        onClick={() => action('log-ride', bikeId)}
                    >
                        Log ride
                    </button>
                    <button
                        className="button secondary"
                        disabled={navigationLocked}
                        onClick={() => action('create-bike', null)}
                    >
                        Create bike
                    </button>
                </div>
            </div>
            {notice && (
                <p className="gap-notice" role="status">
                    {notice}
                </p>
            )}
            <BikeSelector
                bikes={all}
                disabled={navigationLocked}
                bikeId={bikeId}
                onSelect={(id) => navigate(id, view)}
                hasMore={!!bikes.hasNextPage}
                loading={bikes.isFetchingNextPage}
                onLoadMore={() => void bikes.fetchNextPage()}
            />
            {bikes.error && (
                <ReadError
                    error={bikes.error}
                    onRetry={() => void bikes.refetch()}
                />
            )}{' '}
            {missing ? (
                <EmptyState title="Missing bike">
                    <p>
                        This bike is unavailable. Select another bike or create
                        one.
                    </p>
                </EmptyState>
            ) : bike.error ? (
                <ReadError
                    error={bike.error}
                    onRetry={() => void bike.refetch()}
                />
            ) : !bikeId ? (
                bikes.isPending ? (
                    <p role="status">Loading garage…</p>
                ) : (
                    !bikes.error && (
                        <EmptyState title="Your garage is empty">
                            <p>
                                Create your first bike to start recording rides
                                and maintenance.
                            </p>
                        </EmptyState>
                    )
                )
            ) : !bike.data ? (
                <p role="status">Loading bike…</p>
            ) : view === 'overview' ? (
                <Overview
                    key={bikeId}
                    bikeId={bikeId}
                    onEditBike={
                        navigationLocked
                            ? undefined
                            : () => action('edit-bike', bikeId)
                    }
                    onViewComponents={
                        navigationLocked
                            ? undefined
                            : () => navigate(bikeId, 'components')
                    }
                    reminder={renderReminder?.(bikeId, context)}
                />
            ) : (
                (renderView?.(context) ?? (
                    <section className="card integration-placeholder">
                        <h2>{bike.data.displayName}</h2>
                        <p>
                            {viewTitles[view]} will be connected in the next
                            implementation steps.
                        </p>
                    </section>
                ))
            )}
            {renderOverlay?.(context)}
            <DirtyFormGuard
                dirty={pending !== null && dirty}
                onStay={() => setPending(null)}
                onDiscard={() => {
                    const action = pending;
                    setPending(null);
                    action?.();
                }}
            />
        </AppShell>
    );
}
