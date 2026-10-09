import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '@bikelog/api-client';
import { SignIn } from '../src/components/SignIn';
import { SessionExpired } from '../src/components/SessionExpired';
import { createQueryClient, clearPrivateQueries } from '../src/lib/query';

afterEach(() => vi.restoreAllMocks());

describe('authentication UI', () => {
    it('offers invite-only provider sign-in without local credential fields', () => {
        render(<SignIn />);
        expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
        expect(screen.getByRole('link', { name: /sign in with email code/i })).toHaveAttribute('href', '/auth/start?returnTo=%2F');
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByText(/create an account/i)).not.toBeInTheDocument();
    });

    it('explains expiry and pilot access without submitting a write', () => {
        const leave = vi.fn();
        render(<SessionExpired reason="expired" onLeave={leave} />);
        expect(screen.getByText(/session has expired/i)).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: /sign in again/i }));
        expect(leave).toHaveBeenCalledOnce();
    });

    it('cancels requests and clears all private query data on an auth failure', async () => {
        const onAuthError = vi.fn();
        const client = createQueryClient(onAuthError);
        client.setQueryData(['bikes'], [{ id: 'private' }]);
        client.getQueryCache().build(client, {
            queryKey: ['probe'],
            queryFn: async () => { throw new ApiError(401, 'sign_in_required', 'Sign in'); },
            retry: false,
        });
        await client.fetchQuery({
            queryKey: ['probe'],
            queryFn: async () => { throw new ApiError(401, 'sign_in_required', 'Sign in'); },
            retry: false,
        }).catch(() => {});
        expect(onAuthError).toHaveBeenCalledWith('expired');
        await clearPrivateQueries(client);
        expect(client.getQueryData(['bikes'])).toBeUndefined();
    });

    it('recognizes only account-level 403 as pilot access denial', async () => {
        const onAuthError = vi.fn();
        const client = createQueryClient(onAuthError);
        await client.fetchQuery({
            queryKey: ['forbidden'],
            queryFn: async () => { throw new ApiError(403, 'user_not_provisioned', 'Denied'); },
            retry: false,
        }).catch(() => {});
        expect(onAuthError).toHaveBeenCalledWith('pilot-access');
    });
});
