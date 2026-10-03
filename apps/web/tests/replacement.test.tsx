import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@bikelog/api-client';
import { FitComponentForm } from '../src/features/components/FitComponentForm';
import { ReplacementForm } from '../src/features/components/ReplacementForm';
const api = vi.hoisted(() => ({
    createComponent: vi.fn(),
    createInstallation: vi.fn(),
    replaceWithService: vi.fn(),
    listComponents: vi.fn(),
    listInstallations: vi.fn(),
}));
vi.mock('../src/lib/api', () => ({ getApi: () => api }));
const installation = {
    id: 'i1',
    componentId: 'c1',
    bikeId: 'b1',
    position: 'rear-tyre' as const,
    startUtc: '2025-01-01T00:00:00Z',
    endUtc: null,
    version: 7,
};
const component = {
    id: 'c1',
    type: 'tyre' as const,
    model: 'Old',
    initialUsageEstimateMetres: 0,
    version: 1,
    installations: [installation],
};
function mount(node: React.ReactNode) {
    render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            {node}
        </QueryClientProvider>,
    );
}
function fill() {
    fireEvent.change(screen.getByLabelText('Model'), {
        target: { value: 'New' },
    });
    fireEvent.change(screen.getByLabelText('Date and time'), {
        target: { value: '2025-02-01T12:00' },
    });
}
beforeEach(() => {
    vi.resetAllMocks();
    api.listComponents.mockResolvedValue({ items: [], nextCursor: null });
    api.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
    api.createComponent.mockResolvedValue({
        ...component,
        id: 'new',
        model: 'New',
        installations: [],
    });
    api.createInstallation.mockResolvedValue({
        ...installation,
        id: 'new-i',
        componentId: 'new',
    });
    api.replaceWithService.mockResolvedValue({
        component: { ...component, id: 'new', initialUsageEstimateMetres: 0 },
        oldInstallation: { ...installation, endUtc: '2025-02-01T12:00Z' },
        newInstallation: { ...installation, id: 'new-i', componentId: 'new' },
        maintenance: { id: 'm1' },
    });
});
it('replacementUsesExactlyOneCompositeRequest', async () => {
    const saved = vi.fn();
    mount(
        <ReplacementForm
            installation={installation}
            component={component}
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    fill();
    fireEvent.change(screen.getByLabelText('Cost (EUR)'), {
        target: { value: '0' },
    });
    fireEvent.click(screen.getByText('Replace component'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.replaceWithService).toHaveBeenCalledWith(
        'i1',
        expect.objectContaining({
            newModel: 'New',
            expectedInstallationVersion: 7,
            cost: 0,
            currency: 'EUR',
        }),
    );
    const result = saved.mock.calls[0][0];
    expect(Object.keys(result).sort()).toEqual([
        'component',
        'maintenance',
        'newInstallation',
        'oldInstallation',
    ]);
    expect(result.oldInstallation.componentId).toBe('c1');
    expect(result.newInstallation.componentId).toBe('new');
    expect(result.newInstallation.id).not.toBe(result.oldInstallation.id);
    expect(result.component.initialUsageEstimateMetres).toBe(0);
    expect(api.createComponent).not.toHaveBeenCalled();
    expect(api.createInstallation).not.toHaveBeenCalled();
});
it('staleReplacementCannotCreateOrphanClientWork', async () => {
    api.replaceWithService.mockRejectedValue(
        new ApiError(409, 'stale_version', 'Stale'),
    );
    api.listInstallations.mockResolvedValue({
        items: [
            {
                installation: { ...installation, endUtc: '2025-02-01T00:00Z' },
                component,
            },
        ],
        nextCursor: null,
    });
    mount(
        <ReplacementForm
            installation={installation}
            component={component}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fill();
    fireEvent.click(screen.getByText('Replace component'));
    await screen.findByText(/Already replaced/);
    expect(screen.getByText('Reapply my changes')).toBeDisabled();
    expect(api.createComponent).not.toHaveBeenCalled();
});
it('fitFailureRetainsCreatedPartForRetry', async () => {
    api.createInstallation.mockRejectedValueOnce(
        new ApiError(409, 'position_occupied', 'Occupied'),
    );
    mount(
        <FitComponentForm
            bikeId="b1"
            position="rear-tyre"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fill();
    fireEvent.click(screen.getByText('Fit component'));
    await screen.findByText(/Retained component new/);
    fireEvent.click(screen.getByText('Retry fitting retained component'));
    await waitFor(() =>
        expect(api.createInstallation).toHaveBeenCalledTimes(2),
    );
    expect(api.createComponent).toHaveBeenCalledTimes(1);
    expect(api.createComponent).toHaveBeenCalledWith({
        type: 'tyre',
        model: 'New',
    });
});
it('reloadCanResumeFittingExistingUnusedPart', async () => {
    api.listComponents
        .mockResolvedValueOnce({ items: [], nextCursor: 'next' })
        .mockResolvedValueOnce({
            items: [{ ...component, id: 'unused', installations: [] }],
            nextCursor: null,
        });
    mount(
        <FitComponentForm
            bikeId="b1"
            position="rear-tyre"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    await screen.findByRole('option', { name: /Old.*unused/ });
    fireEvent.change(screen.getByLabelText('Existing unused component'), {
        target: { value: 'unused' },
    });
    fireEvent.change(screen.getByLabelText('Date and time'), {
        target: { value: '2025-02-01T12:00' },
    });
    fireEvent.click(screen.getByText('Fit component'));
    await waitFor(() =>
        expect(api.createInstallation).toHaveBeenCalledWith(
            expect.objectContaining({
                componentId: 'unused',
                position: 'rear-tyre',
            }),
        ),
    );
    expect(api.createComponent).not.toHaveBeenCalled();
});
it('uncertainCreationRequiresPagedOwnerReviewBeforeExplicitResubmit', async () => {
    api.createComponent.mockRejectedValueOnce(
        new ApiError(0, 'network', 'Lost response', undefined, true),
    );
    mount(
        <FitComponentForm
            bikeId="b1"
            position="chain"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fill();
    fireEvent.click(screen.getByText('Fit component'));
    await screen.findByText(/The create outcome is uncertain/);
    expect(screen.queryByText('Resubmit after review')).not.toBeInTheDocument();
    api.listComponents
        .mockResolvedValueOnce({ items: [], nextCursor: 'page2' })
        .mockResolvedValueOnce({
            items: [
                {
                    ...component,
                    id: 'discovered',
                    type: 'chain',
                    model: 'New',
                    installations: [],
                },
            ],
            nextCursor: null,
        });
    fireEvent.click(screen.getByText('Refresh owner components'));
    await screen.findByText('Resume fitting this unused part');
    expect(api.createComponent).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Resume fitting this unused part'));
    fireEvent.click(screen.getByText('Retry fitting retained component'));
    await waitFor(() =>
        expect(api.createInstallation).toHaveBeenCalledWith(
            expect.objectContaining({ componentId: 'discovered' }),
        ),
    );
    expect(api.createComponent).toHaveBeenCalledTimes(1);
});
it('staleOpenInstallationRequiresExplicitFreshVersion', async () => {
    api.replaceWithService.mockRejectedValueOnce(
        new ApiError(409, 'stale_version', 'Stale'),
    );
    api.listInstallations
        .mockResolvedValueOnce({ items: [], nextCursor: 'next' })
        .mockResolvedValueOnce({
            items: [
                { installation: { ...installation, version: 9 }, component },
            ],
            nextCursor: null,
        });
    mount(
        <ReplacementForm
            installation={installation}
            component={component}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fill();
    fireEvent.click(screen.getByText('Replace component'));
    await screen.findByText('Reapply my changes');
    expect(api.replaceWithService).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Your attempted changes/)).toHaveTextContent(
        'version 7',
    );
    fireEvent.click(screen.getByText('Reapply my changes'));
    await waitFor(() =>
        expect(api.replaceWithService).toHaveBeenCalledTimes(2),
    );
    expect(api.replaceWithService).toHaveBeenLastCalledWith(
        'i1',
        expect.objectContaining({
            expectedInstallationVersion: 9,
            cost: null,
            currency: null,
        }),
    );
});
it('uncertainReplacementNeverAutomaticallyResubmits', async () => {
    api.replaceWithService.mockRejectedValueOnce(
        new ApiError(0, 'network', 'Lost response', undefined, true),
    );
    mount(
        <ReplacementForm
            installation={installation}
            component={component}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fill();
    fireEvent.click(screen.getByText('Replace component'));
    await screen.findByText(/The replacement outcome is uncertain/);
    expect(api.listInstallations).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Refresh installation history'));
    await screen.findByText('Resubmit after review');
    expect(screen.getByText('Resubmit after review')).toBeDisabled();
    expect(api.replaceWithService).toHaveBeenCalledTimes(1);
});
it('previouslyRemovedCompatiblePartCanBeFittedAndHistoryIsReviewable', async () => {
    api.listComponents.mockResolvedValue({
        items: [
            {
                ...component,
                id: 'retained',
                installations: [
                    { ...installation, endUtc: '2025-02-01T00:00:00Z' },
                ],
            },
        ],
        nextCursor: null,
    });
    mount(
        <FitComponentForm
            bikeId="b1"
            position="rear-tyre"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    await screen.findByRole('option', { name: /Old.*retained/ });
});
it('createdUnusedPartInvalidatesCollectionAndPassportEvenWhenFittingFails', async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['components'], {
        pages: [{ items: [component], nextCursor: 'stale' }],
        pageParams: [undefined],
    });
    client.setQueryData(['component', 'new'], {
        ...component,
        id: 'new',
        model: 'stale',
    });
    client.setQueryData(['componentUsage', 'new'], { lifetimeMetres: 123 });
    client.setQueryData(['componentMaintenance', 'new'], {
        pages: [{ items: [], nextCursor: 'stale' }],
        pageParams: [undefined],
    });
    api.createInstallation.mockRejectedValueOnce(
        new ApiError(409, 'position_occupied', 'Occupied'),
    );
    render(
        <QueryClientProvider client={client}>
            <FitComponentForm
                bikeId="b1"
                position="rear-tyre"
                onSaved={() => {}}
                onCancel={() => {}}
            />
        </QueryClientProvider>,
    );
    fill();
    fireEvent.click(screen.getByText('Fit component'));
    await screen.findByText(/Retained component new/);
    await screen.findByText('Occupied');
    expect(client.getQueryData(['components'])).toBeUndefined();
    expect(client.getQueryData(['component', 'new'])).toBeUndefined();
    expect(client.getQueryData(['componentUsage', 'new'])).toBeUndefined();
    expect(
        client.getQueryData(['componentMaintenance', 'new']),
    ).toBeUndefined();
    fireEvent.click(screen.getByText('Retry fitting retained component'));
    await waitFor(() =>
        expect(api.createInstallation).toHaveBeenCalledTimes(2),
    );
    expect(api.createComponent).toHaveBeenCalledTimes(1);
});
it.each(['fit', 'replacement'])(
    'cleared %s date retains inputs without writes',
    async (flow) => {
        mount(
            flow === 'fit' ? (
                <FitComponentForm
                    bikeId="b1"
                    position="rear-tyre"
                    onSaved={() => {}}
                    onCancel={() => {}}
                />
            ) : (
                <ReplacementForm
                    installation={installation}
                    component={component}
                    onSaved={() => {}}
                    onCancel={() => {}}
                />
            ),
        );
        fill();
        if (flow === 'replacement')
            fireEvent.change(screen.getByLabelText('Cost (EUR)'), {
                target: { value: '12.34' },
            });
        fireEvent.change(screen.getByLabelText('Date and time'), {
            target: { value: '' },
        });
        expect(screen.getByLabelText('Model')).toHaveValue('New');
        expect(screen.getByLabelText('Date and time')).toHaveAttribute(
            'aria-invalid',
            'true',
        );
        if (flow === 'replacement')
            expect(screen.getByLabelText('Cost (EUR)')).toHaveValue('12.34');
        fireEvent.click(
            screen.getByText(
                flow === 'fit' ? 'Fit component' : 'Replace component',
            ),
        );
        expect(api.createComponent).not.toHaveBeenCalled();
        expect(api.createInstallation).not.toHaveBeenCalled();
        expect(api.replaceWithService).not.toHaveBeenCalled();
    },
);
it('retained identity shows authoritative readonly model and retry edits only date', async () => {
    api.createInstallation.mockRejectedValueOnce(
        new ApiError(409, 'position_occupied', 'Occupied'),
    );
    mount(
        <FitComponentForm
            bikeId="b1"
            position="rear-tyre"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fill();
    fireEvent.click(screen.getByText('Fit component'));
    await screen.findByText(/Part created; fitting incomplete/);
    expect(screen.getByLabelText('Model')).toHaveValue('New');
    expect(screen.getByLabelText('Model')).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Date and time'), {
        target: { value: '2025-03-01T12:00' },
    });
    fireEvent.click(screen.getByText('Retry fitting retained component'));
    await waitFor(() =>
        expect(api.createInstallation).toHaveBeenCalledTimes(2),
    );
    expect(api.createComponent).toHaveBeenCalledTimes(1);
    expect(api.createInstallation.mock.calls[1][0].startUtc).not.toBe(
        api.createInstallation.mock.calls[0][0].startUtc,
    );
});
it('existing identity shows authoritative readonly model', async () => {
    api.listComponents.mockResolvedValue({
        items: [{ ...component, id: 'unused', installations: [] }],
        nextCursor: null,
    });
    mount(
        <FitComponentForm
            bikeId="b1"
            position="rear-tyre"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    await screen.findByRole('option', { name: /Old.*unused/ });
    fireEvent.change(screen.getByLabelText('Existing unused component'), {
        target: { value: 'unused' },
    });
    expect(screen.getByLabelText('Model')).toHaveValue('Old');
    expect(screen.getByLabelText('Model')).toHaveAttribute('readonly');
});
it('repeated replacement validation refocuses summary and identifies model', () => {
    mount(
        <ReplacementForm
            installation={installation}
            component={component}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    for (let n = 0; n < 2; n++) {
        screen.getByText('Replace component').focus();
        fireEvent.click(screen.getByText('Replace component'));
        expect(screen.getByRole('alert')).toHaveFocus();
        expect(screen.getByLabelText('Model')).toHaveAttribute(
            'aria-invalid',
            'true',
        );
    }
});
