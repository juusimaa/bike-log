import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Components } from '../src/features/components/Components';
import { ComponentPassport } from '../src/features/components/ComponentPassport';
import { EstimateForm } from '../src/features/components/EstimateForm';
const api = vi.hoisted(() => ({
    listInstallations: vi.fn(),
    listComponents: vi.fn(),
    getComponent: vi.fn(),
    getComponentUsage: vi.fn(),
    listComponentMaintenance: vi.fn(),
    listBikes: vi.fn(),
    editEstimate: vi.fn(),
}));
vi.mock('../src/lib/api', () => ({ getApi: () => api }));
const chapter = {
    id: 'i1',
    bikeId: 'b1',
    componentId: 'c1',
    position: 'chain' as const,
    startUtc: '2025-01-01T00:00:00Z',
    endUtc: null,
    version: 99,
};
const component = {
    id: 'c1',
    type: 'chain' as const,
    make: 'Synthetic',
    model: 'Retained chain',
    version: 7,
    initialUsageEstimateMetres: 120000,
    installations: [chapter],
};
function mount(node: React.ReactNode) {
    return render(
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
beforeEach(() => {
    vi.resetAllMocks();
    api.listBikes.mockResolvedValue({
        items: [
            { id: 'b1', displayName: 'Road' },
            { id: 'b2', displayName: 'Gravel' },
        ],
        nextCursor: null,
    });
    api.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
    api.listComponents.mockResolvedValue({
        items: [component],
        nextCursor: null,
    });
    api.getComponent.mockResolvedValue(component);
    api.getComponentUsage.mockResolvedValue({
        componentId: 'c1',
        lifetimeMetres: 65000,
        initialUsageEstimateMetres: 120000,
        combinedLifetimeMetres: 185000,
        lifetimeSeconds: 61,
        hasUnknownDuration: true,
        installations: [
            {
                installation: chapter,
                metres: 65000,
                seconds: 61,
                hasUnknownDuration: true,
            },
        ],
        calculatedAtUtc: null,
    });
    api.listComponentMaintenance.mockResolvedValue({
        items: [
            {
                id: 'm1',
                bikeId: 'b2',
                task: 'Wax on other bike',
                performedUtc: '2025-02-01T00:00:00Z',
                cost: null,
                currency: null,
            },
        ],
        nextCursor: null,
    });
});
it('historicalRowsRetainIdentityAcrossPages', async () => {
    api.listInstallations.mockImplementation((_id, status, page) =>
        Promise.resolve(
            status === 'current'
                ? { items: [], nextCursor: null }
                : page.cursor
                  ? {
                        items: [
                            {
                                installation: { ...chapter, id: 'i2' },
                                component,
                            },
                        ],
                        nextCursor: null,
                    }
                  : {
                        items: [{ installation: chapter, component }],
                        nextCursor: 'next',
                    },
        ),
    );
    mount(<Components bikeId="b1" />);
    fireEvent.click(screen.getByRole('button', { name: 'All installations' }));
    await screen.findByText('Load more installations');
    fireEvent.click(screen.getByText('Load more installations'));
    await waitFor(() =>
        expect(
            screen.getAllByText('Synthetic Retained chain').length,
        ).toBeGreaterThanOrEqual(2),
    );
    expect(screen.queryByText('Currently fitted')).not.toBeInTheDocument();
});
it('passportUsesOwnerWideHistory', async () => {
    mount(
        <ComponentPassport
            componentId="c1"
            selectedBikeId="b1"
            onClose={() => {}}
        />,
    );
    expect(await screen.findByText('Wax on other bike')).toBeInTheDocument();
    expect(await screen.findByText('Gravel')).toBeInTheDocument();
});
it('estimateSeparatesThreeMileageValues', async () => {
    api.editEstimate.mockResolvedValue({
        ...component,
        initialUsageEstimateMetres: 0,
    });
    mount(
        <EstimateForm
            component={component}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.change(screen.getByLabelText('Starting estimate (km)'), {
        target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save estimate' }));
    await waitFor(() =>
        expect(api.editEstimate).toHaveBeenCalledWith('c1', {
            initialUsageEstimateMetres: 0,
            expectedVersion: 7,
        }),
    );
});
it('incompleteDurationAndUnfittedPartAreExplainable', async () => {
    mount(
        <ComponentPassport
            componentId="c1"
            selectedBikeId="b1"
            onClose={() => {}}
        />,
    );
    expect(await screen.findByText(/Duration incomplete/)).toBeInTheDocument();
    expect(
        await screen.findByText('Starting estimate: 120 km'),
    ).toBeInTheDocument();
    expect(screen.getByText('Calculated lifetime: 65 km')).toBeInTheDocument();
    expect(screen.getByText('Combined lifetime: 185 km')).toBeInTheDocument();
    expect(
        screen.getByText(/Installation distance: 65 km/),
    ).toBeInTheDocument();
    expect(screen.getByText('Not currently fitted')).toBeInTheDocument();
});
it('filterChangeDoesNotAppendLateAllPage', async () => {
    let late!: (value: unknown) => void;
    api.listInstallations.mockImplementation((_id, status) =>
        status === 'current'
            ? Promise.resolve({ items: [], nextCursor: null })
            : new Promise((resolve) => {
                  late = resolve;
              }),
    );
    mount(<Components bikeId="b1" />);
    fireEvent.click(screen.getByText('All installations'));
    await waitFor(() => expect(late).toBeDefined());
    fireEvent.click(screen.getByText('Current installations'));
    late({
        items: [
            {
                installation: chapter,
                component: { ...component, model: 'Late chapter' },
            },
        ],
        nextCursor: 'old',
    });
    await waitFor(() =>
        expect(screen.queryByText('Late chapter')).not.toBeInTheDocument(),
    );
    expect(
        screen.queryByText('Load more installations'),
    ).not.toBeInTheDocument();
});
it('estimateConflictPreservesAttemptAndUsesRefreshedComponentVersion', async () => {
    const { ApiError } = await import('@bikelog/api-client');
    api.editEstimate
        .mockRejectedValueOnce(
            new ApiError(409, 'stale_version', 'Estimate changed'),
        )
        .mockResolvedValueOnce({
            ...component,
            initialUsageEstimateMetres: 1000,
        });
    api.getComponent.mockResolvedValue({
        ...component,
        version: 8,
        initialUsageEstimateMetres: 2000,
    });
    mount(
        <EstimateForm
            component={component}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.change(screen.getByLabelText('Starting estimate (km)'), {
        target: { value: '1' },
    });
    fireEvent.click(screen.getByText('Save estimate'));
    await screen.findByText(/saved version 8/);
    expect(screen.getByLabelText('Starting estimate (km)')).toHaveValue('1');
    fireEvent.click(screen.getByRole('button', { name: /Reapply/ }));
    await waitFor(() =>
        expect(api.editEstimate).toHaveBeenLastCalledWith('c1', {
            initialUsageEstimateMetres: 1000,
            expectedVersion: 8,
        }),
    );
});
it('estimateUncertainRequiresRefreshBeforeExplicitResubmit', async () => {
    const { ApiError } = await import('@bikelog/api-client');
    api.editEstimate.mockRejectedValueOnce(
        new ApiError(0, 'network_error', 'Lost response', undefined, true),
    );
    mount(
        <EstimateForm
            component={component}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.click(screen.getByText('Save estimate'));
    await screen.findByText(/save outcome is uncertain/);
    expect(screen.getByText('Resubmit after review')).toBeDisabled();
    fireEvent.click(screen.getByText('Refresh saved data and usage'));
    await waitFor(() =>
        expect(screen.getByText('Resubmit after review')).toBeEnabled(),
    );
    expect(api.editEstimate).toHaveBeenCalledTimes(1);
});
it('unresolvedBikeShowsUuidAndNeverSelectedBikeName', async () => {
    api.listBikes.mockResolvedValue({
        items: [{ id: 'b1', displayName: 'Road' }],
        nextCursor: null,
    });
    mount(
        <ComponentPassport
            componentId="c1"
            selectedBikeId="b1"
            onClose={() => {}}
        />,
    );
    expect(await screen.findByText(/Unresolved bike b2/)).toBeInTheDocument();
    await screen.findByText('Road');
    expect(screen.getAllByText('Retry bike lookup').length).toBeGreaterThan(0);
});
it('serverOverflowPreservesEstimateWithoutClientRecalculation', async () => {
    const { ApiError } = await import('@bikelog/api-client');
    api.editEstimate.mockRejectedValue(
        new ApiError(
            400,
            'usage_overflow',
            'Combined usage exceeds supported range',
        ),
    );
    mount(
        <EstimateForm
            component={component}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.change(screen.getByLabelText('Starting estimate (km)'), {
        target: { value: '999999' },
    });
    fireEvent.click(screen.getByText('Save estimate'));
    expect(
        await screen.findByText('Combined usage exceeds supported range'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Starting estimate (km)')).toHaveValue(
        '999999',
    );
    expect(api.editEstimate).toHaveBeenCalledTimes(1);
});
it('unfittedCollectionIsExplicit', async () => {
    api.listComponents.mockResolvedValue({
        items: [{ ...component, installations: [] }],
        nextCursor: null,
    });
    mount(<Components bikeId="b1" />);
    expect(await screen.findByText('Never fitted')).toBeInTheDocument();
});
it('vacancyWaitsForEveryAuthoritativeCurrentPage', async () => {
    api.listInstallations.mockImplementation((_id, _status, page) =>
        Promise.resolve(
            page.cursor
                ? {
                      items: [{ installation: chapter, component }],
                      nextCursor: null,
                  }
                : { items: [], nextCursor: 'next' },
        ),
    );
    const fit = vi.fn();
    mount(<Components bikeId="b1" onFit={fit} />);
    await screen.findByRole('button', { name: 'Fit cassette' });
    expect(
        screen.queryByRole('button', { name: 'Fit chain' }),
    ).not.toBeInTheDocument();
});
it('returningToAllFilterStartsFreshFirstPage', async () => {
    let firstReads = 0;
    api.listInstallations.mockImplementation((_id, status, page) => {
        if (status === 'current')
            return Promise.resolve({ items: [], nextCursor: null });
        if (!page.cursor) {
            firstReads++;
            return Promise.resolve({
                items: [
                    {
                        installation: chapter,
                        component: {
                            ...component,
                            model: `First snapshot ${firstReads}`,
                        },
                    },
                ],
                nextCursor: 'old-next',
            });
        }
        return Promise.resolve({
            items: [
                {
                    installation: { ...chapter, id: 'old-second' },
                    component: { ...component, model: 'Old second chapter' },
                },
            ],
            nextCursor: null,
        });
    });
    mount(<Components bikeId="b1" />);
    fireEvent.click(screen.getByText('All installations'));
    await screen.findByText('Synthetic First snapshot 1');
    fireEvent.click(screen.getByText('Load more installations'));
    await screen.findByText('Synthetic Old second chapter');
    fireEvent.click(screen.getByText('Current installations'));
    await waitFor(() =>
        expect(screen.getByText('Current installations')).toHaveAttribute(
            'aria-pressed',
            'true',
        ),
    );
    fireEvent.click(screen.getByText('All installations'));
    await screen.findByText('Synthetic First snapshot 2');
    expect(
        screen.queryByText('Synthetic Old second chapter'),
    ).not.toBeInTheDocument();
    const allReads = api.listInstallations.mock.calls.filter(
        (call) => call[1] === 'all',
    );
    expect(allReads.map((call) => call[2].cursor)).toEqual([
        undefined,
        'old-next',
        undefined,
    ]);
});
it.each([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1])(
    'unchanged estimate preserves %s metres',
    async (metres) => {
        api.editEstimate.mockResolvedValue({
            ...component,
            initialUsageEstimateMetres: metres,
        });
        mount(
            <EstimateForm
                component={{ ...component, initialUsageEstimateMetres: metres }}
                onSaved={() => {}}
                onCancel={() => {}}
            />,
        );
        fireEvent.click(screen.getByText('Save estimate'));
        await waitFor(() =>
            expect(api.editEstimate).toHaveBeenCalledWith('c1', {
                initialUsageEstimateMetres: metres,
                expectedVersion: 7,
            }),
        );
    },
);
it('repeated invalid estimate focuses summary and associates quantity error', () => {
    mount(
        <EstimateForm
            component={component}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.change(screen.getByLabelText('Starting estimate (km)'), {
        target: { value: '1.0001' },
    });
    for (let n = 0; n < 2; n++) {
        screen.getByText('Save estimate').focus();
        fireEvent.click(screen.getByText('Save estimate'));
        expect(screen.getByRole('alert')).toHaveFocus();
        expect(screen.getByLabelText('Starting estimate (km)')).toHaveAttribute(
            'aria-invalid',
            'true',
        );
    }
});
it('passport displays make and model alongside prose durations', async () => {
    api.getComponent.mockResolvedValue(component);
    api.getComponentUsage.mockResolvedValue({
        componentId: 'c1',
        lifetimeMetres: 0,
        combinedLifetimeMetres: 0,
        lifetimeSeconds: 90,
        hasUnknownDuration: false,
        installations: [],
        calculatedAtUtc: null,
    });
    mount(
        <ComponentPassport
            componentId="c1"
            selectedBikeId="b1"
            onClose={() => {}}
        />,
    );
    expect(
        await screen.findByRole('dialog', {
            name: 'Synthetic Retained chain passport',
        }),
    ).toBeVisible();
    expect(screen.getByText('Make: Synthetic')).toBeVisible();
    expect(screen.getByText('Model: Retained chain')).toBeVisible();
    expect(await screen.findByText('Recorded duration: 1.5 min')).toBeVisible();
});
