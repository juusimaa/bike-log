import { expect, it } from 'vitest';
import {
    ApiError,
    createApiClient,
    type CreateBike,
} from '@bikelog/api-client';
import { act, renderHook } from '@testing-library/react';
import {
    createMutationRecovery,
    useMutationRecovery,
} from '../src/lib/mutation';
it('mutationDoesNotAutomaticallyRetry', async () => {
    let sends = 0;
    const sentBodies: unknown[] = [];
    const api = createApiClient('http://127.0.0.1:3000', async (request) => {
        const sent = new Request(request);
        expect(sent.method).toBe('POST');
        expect(sent.url).toBe('http://127.0.0.1:3000/api/bikes');
        sentBodies.push(await sent.json());
        sends++;
        throw new TypeError('Response lost after request delivery');
    });
    const recovery = createMutationRecovery(api.createBike);
    const fields = {
        name: 'Retained bike',
        make: null,
        model: null,
        kind: 'gravel',
        year: 2026,
    } satisfies CreateBike;
    await recovery.submit(fields);
    expect(sends).toBe(1);
    expect(sentBodies).toEqual([fields]);
    expect(recovery.getState()).toMatchObject({
        phase: 'uncertain',
        attempted: fields,
    });
    await recovery.submit(fields);
    expect(sends).toBe(1);
    await recovery.refreshCurrent(async () => ({ name: 'Stored bike' }));
    expect(recovery.getState()).toMatchObject({
        phase: 'uncertain',
        current: { name: 'Stored bike' },
        refreshed: true,
    });
    await recovery.resubmit(fields);
    expect(sends).toBe(2);
});
it('blocks repeat submit while saving', async () => {
    let finish!: (value: string) => void;
    let sends = 0;
    const recovery = createMutationRecovery(() => {
        sends++;
        return new Promise<string>((resolve) => {
            finish = resolve;
        });
    });
    const pending = recovery.submit('fields');
    await recovery.submit('changed');
    expect(sends).toBe(1);
    expect(recovery.getState()).toMatchObject({
        phase: 'saving',
        attempted: 'fields',
    });
    finish('saved');
    await pending;
    expect(recovery.getState().phase).toBe('saved');
});
it('retains validation fields and treats only stale_version as conflict', async () => {
    for (const [status, code, phase] of [
        [400, 'invalid_input', 'validation'],
        [409, 'overlap', 'validation'],
        [409, 'stale_version', 'conflict'],
    ] as const) {
        const recovery = createMutationRecovery(async () => {
            throw new ApiError(status, code, 'Rejected', 2);
        });
        await recovery.submit({ value: 'unsaved' });
        expect(recovery.getState()).toMatchObject({
            phase,
            attempted: { value: 'unsaved' },
        });
    }
});
it('loads current separately and reapplies only explicit versioned input', async () => {
    const sent: unknown[] = [];
    const recovery = createMutationRecovery(
        async (input: { expectedVersion: number; name: string }) => {
            sent.push(input);
            if (input.expectedVersion === 1)
                throw new ApiError(409, 'stale_version', 'Stale', 2);
            return input;
        },
    );
    await recovery.submit({ expectedVersion: 1, name: 'Mine' });
    await recovery.reapply({ expectedVersion: 2, name: 'Mine' });
    expect(sent).toHaveLength(1);
    await recovery.refreshCurrent(async () => ({ version: 2, name: 'Other' }));
    expect(recovery.getState().attempted).toEqual({
        expectedVersion: 1,
        name: 'Mine',
    });
    expect(sent).toHaveLength(1);
    await recovery.reapply({ expectedVersion: 2, name: 'Mine' });
    expect(sent).toEqual([
        { expectedVersion: 1, name: 'Mine' },
        { expectedVersion: 2, name: 'Mine' },
    ]);
    expect(recovery.getState().phase).toBe('saved');
});
it('failed refresh does not authorize resubmission', async () => {
    let sends = 0;
    const recovery = createMutationRecovery(async () => {
        sends++;
        throw new ApiError(0, 'lost', 'Lost', undefined, true);
    });
    await recovery.submit('input');
    await recovery.refreshCurrent(async () => {
        throw new Error('Read failed');
    });
    await recovery.resubmit('input');
    expect(sends).toBe(1);
    expect(recovery.getState()).toMatchObject({
        phase: 'uncertain',
        refreshed: false,
        attempted: 'input',
    });
});
it('React recovery keeps state while using the latest operation after rerender', async () => {
    const { result, rerender } = renderHook(
        ({ prefix }: { prefix: string }) =>
            useMutationRecovery(async (input: string) => `${prefix}:${input}`),
        { initialProps: { prefix: 'old' } },
    );
    await act(async () => {
        await result.current.submit('bike');
    });
    expect(result.current.state).toMatchObject({
        phase: 'saved',
        attempted: 'bike',
        result: 'old:bike',
    });
    rerender({ prefix: 'new' });
    await act(async () => {
        await result.current.submit('bike');
    });
    expect(result.current.state.result).toBe('new:bike');
});
