import type { BikeRef } from '@bikelog/api-client';
import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Components } from '../src/features/components/Components';
import { ComponentPassport } from '../src/features/components/ComponentPassport';
import { EstimateForm } from '../src/features/components/EstimateForm';
import { DeleteComponentDialog } from '../src/features/components/DeleteComponentDialog';
import { queryKeys } from '../src/lib/query';
import { catalog, overviewExtras, status } from './catalog-fixture';
const api = vi.hoisted(() => ({
    getComponentCatalog: vi.fn(),
    listExemptions: vi.fn(),
    getOverview: vi.fn(),
    listInstallations: vi.fn(),
    listComponents: vi.fn(),
    getComponent: vi.fn(),
    getComponentUsage: vi.fn(),
    listComponentMaintenance: vi.fn(),
    listBikes: vi.fn(),
    editEstimate: vi.fn(),
    getReminder: vi.fn(),
    deleteComponent: vi.fn(),
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
    group: 'groupset',
    weightGrams: null,
    bikes: [] as BikeRef[],
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
    api.getComponentCatalog.mockResolvedValue(catalog);
    api.listExemptions.mockResolvedValue([]);
    api.getOverview.mockResolvedValue({
        bike: { id: 'b1', displayName: 'Road', missingPositions: [] },
        currentComponents: [],
        allocationGaps: [],
        ...overviewExtras(),
    });
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
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter components' }),
        { target: { value: 'all' } },
    );
    await screen.findByText('Load more installations');
    fireEvent.click(screen.getByText('Load more installations'));
    await waitFor(() =>
        expect(
            screen.getAllByText('Synthetic Retained chain').length,
        ).toBeGreaterThanOrEqual(2),
    );
    expect(screen.queryByText('Fitted')).not.toBeInTheDocument();
});
it('passportUsesOwnerWideHistory', async () => {
    mount(<ComponentPassport componentId="c1" onClose={() => {}} />);
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
    mount(<ComponentPassport componentId="c1" onClose={() => {}} />);
    expect(
        await screen.findByText(
            'At least 1 min 1 sec ridden; some rides have no duration',
        ),
    ).toBeInTheDocument();
    expect(screen.getByText('185 km')).toBeInTheDocument();
    expect(
        screen.getByText('65 km from rides + 120 km estimate'),
    ).toBeInTheDocument();
    expect(screen.getByText('65 km')).toBeInTheDocument();
    expect(screen.getByText('at least 1 min 1 sec')).toBeInTheDocument();
    expect(await screen.findByText('Not currently fitted')).toBeInTheDocument();
});
it('passportSaysWhenLubricationIsDueForThisPart', async () => {
    api.listInstallations.mockResolvedValue({
        items: [{ installation: chapter, component }],
        nextCursor: null,
    });
    api.getReminder.mockResolvedValue({
        ruleVersion: 1,
        state: 'ready',
        enabled: true,
        method: 'wax',
        oilThresholdMetres: null,
        waxThresholdMetres: 300000,
        activeThresholdMetres: 300000,
        evaluatedAtUtc: '2025-03-01T00:00:00Z',
        componentId: 'c1',
        installationId: 'i1',
        baselineKind: 'maintenance',
        baselineUtc: '2025-02-01T00:00:00Z',
        distanceSinceBaselineMetres: 310000,
        remainingMetres: 0,
        due: true,
    });
    mount(<ComponentPassport componentId="c1" onClose={() => {}} />);
    expect(await screen.findByText('Lubrication due')).toBeVisible();
    expect(
        screen.getByText(/310 km since service · reminder every 300 km/),
    ).toBeVisible();
    expect(
        screen.getByText('Last service: Wax on other bike · 1 Feb 2025'),
    ).toBeVisible();
    expect(await screen.findByText('Currently fitted')).toBeVisible();
});
it('passportIgnoresAReminderThatFollowsAnotherPart', async () => {
    api.getReminder.mockResolvedValue({
        ruleVersion: 1,
        state: 'ready',
        enabled: true,
        method: 'oil',
        oilThresholdMetres: 200000,
        waxThresholdMetres: null,
        activeThresholdMetres: 200000,
        evaluatedAtUtc: '2025-03-01T00:00:00Z',
        componentId: 'other-chain',
        installationId: 'i9',
        baselineKind: 'installation',
        baselineUtc: '2025-02-01T00:00:00Z',
        distanceSinceBaselineMetres: 10000,
        remainingMetres: 190000,
        due: false,
    });
    mount(<ComponentPassport componentId="c1" onClose={() => {}} />);
    expect(
        await screen.findByText('Last service: Wax on other bike · 1 Feb 2025'),
    ).toBeVisible();
    await waitFor(() => expect(api.getReminder).toHaveBeenCalled());
    expect(screen.queryByText(/until lubrication/)).not.toBeInTheDocument();
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
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter components' }),
        { target: { value: 'all' } },
    );
    await waitFor(() => expect(late).toBeDefined());
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter components' }),
        { target: { value: 'current' } },
    );
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
    mount(<ComponentPassport componentId="c1" onClose={() => {}} />);
    expect(await screen.findByText(/Unresolved bike b2/)).toBeInTheDocument();
    expect((await screen.findAllByText('Road')).length).toBeGreaterThan(0);
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
it('boardRendersEveryCatalogPositionByGroupFromTheApi', async () => {
    api.getOverview.mockResolvedValue({
        bike: { id: 'b1', displayName: 'Road', missingPositions: [] },
        currentComponents: [],
        allocationGaps: [],
        ...overviewExtras({
            chain: status('chain', 'fitted', {
                componentId: 'c1',
                installationId: 'i1',
                sinceUtc: '2025-01-01T00:00:00Z',
            }),
        }),
    });
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
    for (const group of ['Build', 'Groupset', 'Wheels'])
        expect(
            await screen.findByRole('heading', { name: group }),
        ).toBeInTheDocument();
    expect(document.querySelectorAll('.pos-row')).toHaveLength(28);
    await waitFor(() =>
        expect(
            document.querySelector('.pos-row.state-fitted'),
        ).toHaveTextContent('Synthetic Retained chain'),
    );
    expect(
        screen.queryByRole('button', { name: 'Fit chain' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fit cassette' }));
    expect(fit).toHaveBeenCalledWith('cassette');
});
it('boardFollowsAnExtendedCatalogWithoutCodeChanges', async () => {
    const extended = {
        ...catalog,
        groups: [...catalog.groups, 'accessories'],
        positions: [
            ...catalog.positions,
            {
                position: 'bottle-cage',
                type: 'bottle-cage',
                group: 'accessories',
                end: null,
                label: 'Bottle cage',
                exemption: null,
            },
        ],
    };
    api.getComponentCatalog.mockResolvedValue(extended);
    api.getOverview.mockResolvedValue({
        bike: { id: 'b1', displayName: 'Road', missingPositions: [] },
        currentComponents: [],
        allocationGaps: [],
        ...overviewExtras(),
        positionStatuses: extended.positions.map((p) => status(p.position)),
    });
    mount(<Components bikeId="b1" onFit={() => {}} />);
    expect(
        await screen.findByRole('heading', { name: 'Accessories' }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('.pos-row')).toHaveLength(29);
    expect(
        screen.getByRole('button', { name: 'Fit bottle cage' }),
    ).toBeInTheDocument();
});
it('emptyOnPurposeAndMissingPositionsExplainThemselves', async () => {
    api.getOverview.mockResolvedValue({
        bike: { id: 'b1', displayName: 'Road', missingPositions: ['saddle'] },
        currentComponents: [],
        allocationGaps: [],
        ...overviewExtras({
            saddle: status('saddle', 'missing', {
                sinceUtc: '2026-10-12T10:00:00Z',
            }),
            'front-derailleur': status('front-derailleur', 'exempt', {
                reason: 'none-fitted',
                exemptionId: 'e1',
                sinceUtc: '2026-03-01T10:00:00Z',
            }),
        }),
    });
    mount(<Components bikeId="b1" onFit={() => {}} />);
    expect(await screen.findByText('None fitted')).toBeInTheDocument();
    expect(screen.getByText('Missing since 12 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/This bike is incomplete/)).toHaveTextContent(
        'saddle missing since 12 Oct 2026',
    );
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
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter components' }),
        { target: { value: 'all' } },
    );
    await screen.findByText('Synthetic First snapshot 1');
    fireEvent.click(screen.getByText('Load more installations'));
    await screen.findByText('Synthetic Old second chapter');
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter components' }),
        { target: { value: 'current' } },
    );
    await waitFor(() =>
        expect(
            screen.getByRole('combobox', { name: 'Filter components' }),
        ).toHaveValue('current'),
    );
    fireEvent.change(
        screen.getByRole('combobox', { name: 'Filter components' }),
        { target: { value: 'all' } },
    );
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
    mount(<ComponentPassport componentId="c1" onClose={() => {}} />);
    expect(
        await screen.findByRole('dialog', {
            name: 'Synthetic Retained chain',
        }),
    ).toBeVisible();
    expect(screen.getByText('Component ID: c1')).not.toBeVisible();
    expect(await screen.findByText('1.5 min ridden')).toBeVisible();
});
it('passport names an empty service history instead of showing a bike id', async () => {
    api.listComponentMaintenance.mockResolvedValue({
        items: [],
        nextCursor: null,
    });
    mount(<ComponentPassport componentId="c1" onClose={() => {}} />);
    expect(
        await screen.findByText('No service recorded for this part yet.'),
    ).toBeVisible();
    expect(screen.queryByText(/b1/)).not.toBeInTheDocument();
});
it('passportOffersDeleteAndNamesDeletedBikesWithoutALink', async () => {
    api.getComponent.mockResolvedValue({
        ...component,
        installations: [
            {
                ...chapter,
                id: 'i0',
                bikeId: 'gone',
                endUtc: '2025-01-01T00:00:00Z',
                startUtc: '2024-06-01T00:00:00Z',
            },
            chapter,
        ],
        bikes: [
            { id: 'gone', displayName: 'Canyon', state: 'deleted' },
            { id: 'b1', displayName: 'Road', state: 'active' },
        ],
    });
    const onDelete = vi.fn();
    const onOpenBike = vi.fn();
    mount(
        <ComponentPassport
            componentId="c1"
            onClose={() => {}}
            onDelete={onDelete}
            onOpenBike={onOpenBike}
        />,
    );
    expect(await screen.findByText('Canyon (deleted)')).toBeVisible();
    expect(
        screen.queryByRole('link', { name: /Canyon/ }),
    ).not.toBeInTheDocument();
    const road = screen.getAllByRole('link', { name: 'Road' });
    expect(road[0]).toHaveAttribute('href', '/?bike=b1&view=overview');
    fireEvent.click(road.at(-1)!);
    expect(onOpenBike).toHaveBeenCalledWith('b1');
    fireEvent.click(screen.getByRole('button', { name: 'Delete part…' }));
    expect(onDelete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1', version: 7 }),
    );
});
it('deletingAFittedPartNamesItsPlaceWarnsAndRefreshesItsBike', async () => {
    api.deleteComponent.mockResolvedValue(undefined);
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const reset = vi.spyOn(client, 'resetQueries');
    const deleted = vi.fn();
    render(
        <QueryClientProvider client={client}>
            <DeleteComponentDialog
                component={{
                    ...component,
                    bikes: [{ id: 'b1', displayName: 'Road', state: 'active' }],
                }}
                onDeleted={deleted}
                onCancel={() => {}}
            />
        </QueryClientProvider>,
    );
    const dialog = screen.getByRole('dialog', {
        name: 'Delete Synthetic Retained chain?',
    });
    expect(dialog).toHaveTextContent('It is fitted to Road as the chain.');
    expect(dialog).toHaveTextContent('This cannot be undone.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete part' }));
    await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
    expect(api.deleteComponent).toHaveBeenCalledWith('c1', 7);
    const keys = reset.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.components()));
    expect(keys).toContain(JSON.stringify(queryKeys.overview('b1')));
});
it('deletingASpareSaysSoWithoutNamingABike', async () => {
    mount(
        <DeleteComponentDialog
            component={{ ...component, installations: [] }}
            onDeleted={() => {}}
            onCancel={() => {}}
        />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('It is fitted to');
    expect(dialog).toHaveTextContent('This cannot be undone.');
});
