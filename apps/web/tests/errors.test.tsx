import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@bikelog/api-client';
import { errorText, readErrorCopy } from '../src/lib/errors';
import { Toast } from '../src/components/Toast';
const problem = (status: number, code: string, detail?: string) =>
    new ApiError(status, code, code, undefined, false, {
        code,
        ...(detail ? { detail } : {}),
    });
describe('user-facing error copy', () => {
    afterEach(() => vi.restoreAllMocks());
    it('prefersProblemDetailOverTheCodeInTitle', () => {
        expect(
            errorText(problem(400, 'invalid_input', 'Distance is required.')),
        ).toBe('Distance is required.');
    });
    it('neverShowsABareCode', () => {
        expect(errorText(problem(400, 'invalid_input'))).toBe(
            'The request could not be completed.',
        );
        expect(errorText(problem(500, 'request_failed'))).toMatch(
            /problem on the server/,
        );
    });
    it('humanizesCamelCaseFieldNames', () => {
        expect(
            errorText(
                problem(
                    400,
                    'invalid_input',
                    'newMake must be at most 100 characters.',
                ),
            ),
        ).toBe('Make must be at most 100 characters.');
        expect(
            errorText(problem(400, 'invalid_input', 'startUtc is required.')),
        ).toBe('Start time is required.');
    });
    it('explainsUnreachableAndOfflineAndRateLimited', () => {
        const down = new ApiError(
            0,
            'backend_unavailable',
            'The API could not be reached.',
        );
        expect(errorText(down)).toMatch(/could not reach the server/);
        expect(readErrorCopy(down).title).toBe('Can’t reach Bike Log');
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
        expect(readErrorCopy(down)).toEqual({
            title: 'You are offline',
            body: 'You appear to be offline. Reconnect, then try again.',
        });
        expect(errorText(problem(429, 'rate_limited'))).toMatch(
            /Wait a moment/,
        );
    });
    it('namesMissingRecords', () => {
        expect(readErrorCopy(problem(404, 'not_found')).title).toBe(
            'Not found',
        );
    });
    it('dropsTheErrorClassPrefix', () => {
        expect(errorText(new Error('Enter whole grams.'))).toBe(
            'Enter whole grams.',
        );
    });
});
describe('toast', () => {
    it('hidesItselfAndReannouncesARepeatedMessage', () => {
        vi.useFakeTimers();
        const { rerender } = render(<Toast message="Ride saved." seq={1} />);
        const toast = screen.getByRole('status');
        expect(toast).toHaveClass('visible');
        act(() => vi.advanceTimersByTime(6000));
        expect(toast).not.toHaveClass('visible');
        const first = toast.firstElementChild;
        rerender(<Toast message="Ride saved." seq={2} />);
        expect(toast).toHaveClass('visible');
        expect(toast.firstElementChild).not.toBe(first);
        vi.useRealTimers();
    });
});
