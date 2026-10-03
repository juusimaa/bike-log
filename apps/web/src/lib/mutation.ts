'use client';
import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { ApiError } from '@bikelog/api-client';
export type MutationPhase =
    'idle' | 'saving' | 'saved' | 'validation' | 'conflict' | 'uncertain';
export type MutationState<T = unknown, R = unknown> = {
    phase: MutationPhase;
    attempted: T | undefined;
    error?: ApiError;
    result?: R;
    current?: unknown;
    refreshed: boolean;
    refreshing: boolean;
    refreshError?: Error;
};
/** A single mutation attempt. Refresh never sends writes or replaces attempted fields. */
export function createMutationRecovery<T, R>(
    operation: (input: T) => Promise<R>,
) {
    let state: MutationState<T, R> = {
        phase: 'idle',
        attempted: undefined,
        refreshed: false,
        refreshing: false,
    };
    const listeners = new Set<() => void>();
    function update(next: MutationState<T, R>) {
        state = next;
        listeners.forEach((listener) => listener());
    }
    async function send(input: T): Promise<R | undefined> {
        update({
            phase: 'saving',
            attempted: input,
            refreshed: false,
            refreshing: false,
        });
        try {
            const result = await operation(input);
            update({ ...state, phase: 'saved', result });
            return result;
        } catch (cause) {
            const error =
                cause instanceof ApiError
                    ? cause
                    : new ApiError(
                          0,
                          'unknown_outcome',
                          'The save outcome is uncertain. Refresh and check history before resubmitting.',
                          undefined,
                          true,
                      );
            const phase = error.uncertain
                ? 'uncertain'
                : error.status === 409 && error.code === 'stale_version'
                  ? 'conflict'
                  : 'validation';
            update({ ...state, phase, error });
            return undefined;
        }
    }
    return {
        getState: () => state,
        updateOperation(next: (input: T) => Promise<R>) {
            operation = next;
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        submit(input: T) {
            if (['saving', 'conflict', 'uncertain'].includes(state.phase))
                return Promise.resolve(undefined);
            return send(input);
        },
        reapply(input: T) {
            return state.phase === 'conflict' &&
                state.refreshed &&
                !state.refreshing
                ? send(input)
                : Promise.resolve(undefined);
        },
        resubmit(input: T) {
            return state.phase === 'uncertain' &&
                state.refreshed &&
                !state.refreshing
                ? send(input)
                : Promise.resolve(undefined);
        },
        async refreshCurrent(read: () => Promise<unknown>) {
            if (
                !['conflict', 'uncertain'].includes(state.phase) ||
                state.refreshing
            )
                return;
            update({
                ...state,
                refreshing: true,
                refreshed: false,
                refreshError: undefined,
            });
            try {
                const current = await read();
                update({
                    ...state,
                    current,
                    refreshed: true,
                    refreshing: false,
                });
            } catch (cause) {
                update({
                    ...state,
                    refreshed: false,
                    refreshing: false,
                    refreshError:
                        cause instanceof Error
                            ? cause
                            : new Error('Refresh failed.'),
                });
            }
        },
        reset() {
            if (state.phase !== 'saving' && !state.refreshing)
                update({
                    phase: 'idle',
                    attempted: undefined,
                    refreshed: false,
                    refreshing: false,
                });
        },
    };
}
export function useMutationRecovery<T, R>(operation: (input: T) => Promise<R>) {
    const [recovery] = useState(() => createMutationRecovery<T, R>(operation));
    useLayoutEffect(() => {
        recovery.updateOperation(operation);
    }, [recovery, operation]);
    const state = useSyncExternalStore(
        recovery.subscribe,
        recovery.getState,
        recovery.getState,
    );
    return { ...recovery, state };
}
