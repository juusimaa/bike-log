import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@bikelog/api-client';
import { BikeForm } from '../src/features/bikes/BikeForm';
import { HomeClient as Home } from '../src/components/HomeClient';
const a = '11111111-1111-1111-1111-111111111111',
    b = '22222222-2222-2222-2222-222222222222';
const bike = {
    id: a,
    name: 'Old',
    displayName: 'Old',
    make: 'Trek',
    model: 'Domane',
    kind: 'road' as const,
    year: 2020,
    color: null,
    version: 9,
};
const api = vi.hoisted(() => ({
    createBike: vi.fn(),
    editBike: vi.fn(),
    getBike: vi.fn(),
    listBikes: vi.fn(),
    getOverview: vi.fn(),
    getReminder: vi.fn(),
    listInstallations: vi.fn(),
}));
vi.mock('../src/lib/api', () => ({ getApi: () => api }));
beforeEach(() => {
    vi.resetAllMocks();
    api.getReminder.mockResolvedValue({
        ruleVersion: 0,
        state: 'disabled',
        enabled: false,
        method: null,
        oilThresholdMetres: null,
        waxThresholdMetres: null,
        activeThresholdMetres: null,
        evaluatedAtUtc: '2026-10-03T00:00:00Z',
        componentId: null,
        installationId: null,
        baselineKind: null,
        baselineUtc: null,
        distanceSinceBaselineMetres: null,
        remainingMetres: null,
        due: null,
    });
    window.history.replaceState(null, '', '/');
    api.createBike.mockResolvedValue({
        ...bike,
        id: b,
        name: null,
        displayName: 'Trek Domane',
    });
    api.editBike.mockResolvedValue({
        ...bike,
        name: null,
        displayName: 'Trek Domane',
        version: 10,
    });
    api.getBike.mockResolvedValue({ ...bike, version: 10 });
});
function mount(record?: typeof bike) {
    render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <BikeForm bike={record} onSaved={() => {}} onCancel={() => {}} />
        </QueryClientProvider>,
    );
}
function change(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function fill() {
    change('Make', ' Trek ');
    change('Model', ' Domane ');
    change('Kind', 'road');
    change('Year', '2020');
}
it('createsBikeWithoutInventedParts', async () => {
    mount();
    fill();
    change('Bike name', '  ');
    change('Color', '#aabbcc');
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    await waitFor(() =>
        expect(api.createBike).toHaveBeenCalledWith({
            name: null,
            make: 'Trek',
            model: 'Domane',
            kind: 'road',
            year: 2020,
            color: '#aabbcc',
        }),
    );
    expect(api.listInstallations).not.toHaveBeenCalled();
});
it.each([false, true])(
    'savesColorNameOnCreateAndEdit (edit=%s)',
    async (editing) => {
        mount(editing ? bike : undefined);
        if (!editing) fill();
        change('Color', ' Hazy IPA ');
        fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
        await waitFor(() => {
            if (editing)
                expect(api.editBike).toHaveBeenCalledWith(
                    a,
                    expect.objectContaining({ color: 'Hazy IPA' }),
                );
            else
                expect(api.createBike).toHaveBeenCalledWith(
                    expect.objectContaining({ color: 'Hazy IPA' }),
                );
        });
    },
);
it('clearingNameUsesServerFallback', async () => {
    mount(bike);
    change('Bike name', ' ');
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    await waitFor(() =>
        expect(api.editBike).toHaveBeenCalledWith(a, {
            name: null,
            make: 'Trek',
            model: 'Domane',
            kind: 'road',
            year: 2020,
            color: null,
            expectedVersion: 9,
        }),
    );
});
it('legacyEditCollectsMissingMetadata', async () => {
    mount({
        ...bike,
        make: null,
        model: null,
        kind: null,
        year: null,
    } as unknown as typeof bike);
    change('Bike name', '');
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Make is required',
    );
    expect(api.editBike).not.toHaveBeenCalled();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    await waitFor(() => expect(api.editBike).toHaveBeenCalledTimes(1));
});
it('staleBikeEditRetainsAttemptAndRequiresReapply', async () => {
    api.editBike.mockRejectedValueOnce(
        new ApiError(409, 'stale_version', 'Changed'),
    );
    api.getBike.mockResolvedValue({
        ...bike,
        name: 'Remote',
        displayName: 'Remote',
        version: 10,
    });
    mount(bike);
    change('Bike name', 'Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    await screen.findByRole('button', { name: 'Reapply my changes' });
    expect(screen.getByLabelText('Bike name')).toHaveValue('Attempt');
    expect(screen.getByLabelText('Save conflict')).toHaveTextContent('Remote');
    expect(api.editBike).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reapply my changes' }));
    await waitFor(() =>
        expect(api.editBike).toHaveBeenLastCalledWith(
            a,
            expect.objectContaining({ name: 'Attempt', expectedVersion: 10 }),
        ),
    );
});
it('uncertainWriteRequiresRefreshAndExplicitResubmit', async () => {
    api.editBike.mockRejectedValueOnce(new Error('lost'));
    mount(bike);
    change('Bike name', 'Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    const retry = await screen.findByRole('button', {
        name: 'Resubmit after review',
    });
    expect(retry).toBeDisabled();
    expect(screen.getByLabelText('Bike name')).toHaveValue('Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved data' }));
    await waitFor(() => expect(retry).toBeEnabled());
    expect(api.editBike).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(api.editBike).toHaveBeenCalledTimes(2));
});
it('invalidYearAndOverlongColorNeverWrite', async () => {
    mount();
    fill();
    change('Year', '2020.5');
    change('Color', 'x'.repeat(101));
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Year');
    expect(screen.getByRole('alert')).toHaveTextContent('Color');
    expect(api.createBike).not.toHaveBeenCalled();
});
it('dirtyBikeSwitchRequiresChoice', async () => {
    api.listBikes.mockResolvedValue({
        items: [bike, { ...bike, id: b, displayName: 'Other' }],
        nextCursor: null,
    });
    api.getBike.mockImplementation(async (id) => ({ ...bike, id }));
    api.getOverview.mockResolvedValue({
        bike,
        rideCount: 0,
        recordedDistanceMetres: 0,
        maintenanceRecordCount: 0,
        currentComponents: [],
        allocationGaps: [],
        spendingByCurrency: [],
        unknownCostRecordCount: 0,
        recentActivity: [],
    });
    api.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit bike' }));
    change('Bike name', 'Attempt');
    fireEvent.click(screen.getByRole('button', { name: /Other/ }));
    await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    expect(screen.getByLabelText('Bike name')).toHaveValue('Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(window.location.search).toContain(a);
    fireEvent.click(screen.getByRole('button', { name: /Other/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() =>
        expect(screen.queryByLabelText('Bike name')).not.toBeInTheDocument(),
    );
    expect(window.location.search).toContain(b);
});
function garageFixture() {
    api.listBikes.mockResolvedValue({
        items: [bike, { ...bike, id: b, displayName: 'Other' }],
        nextCursor: null,
    });
    api.getBike.mockImplementation(async (id) => ({ ...bike, id }));
    api.getOverview.mockImplementation(async (id) => ({
        bike: { ...bike, id },
        rideCount: 0,
        recordedDistanceMetres: 0,
        maintenanceRecordCount: 0,
        currentComponents: [],
        allocationGaps: [],
        spendingByCurrency: [],
        unknownCostRecordCount: 0,
        recentActivity: [],
    }));
    api.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
}
it('pendingWriteCannotNavigateOrReplaceCapturedDestination', async () => {
    garageFixture();
    let resolve!: (value: typeof bike) => void;
    api.editBike.mockImplementation(
        () =>
            new Promise((r) => {
                resolve = r;
            }),
    );
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit bike' }));
    change('Bike name', 'Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: /Other/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create bike' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Components' })).toHaveAttribute(
        'aria-disabled',
        'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /Other/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create bike' }));
    expect(
        screen.queryByRole('dialog', { name: 'Discard unsaved changes?' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Bike name')).toHaveValue('Attempt');
    expect(window.location.search).toContain(a);
    resolve({ ...bike, name: 'Attempt', displayName: 'Attempt' });
    await waitFor(() =>
        expect(screen.queryByLabelText('Bike name')).not.toBeInTheDocument(),
    );
    expect(api.editBike).toHaveBeenCalledWith(
        a,
        expect.objectContaining({ expectedVersion: 9 }),
    );
});
it('successfulCreationSelectsReturnedIdAfterInvalidation', async () => {
    garageFixture();
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create bike' }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    await waitFor(() => expect(window.location.search).toContain(b));
    expect(screen.queryByLabelText('Make')).not.toBeInTheDocument();
    expect(api.listBikes.mock.calls.length).toBeGreaterThan(1);
});
it('newActionRetainsDirtyEditorUntilExplicitChoice', async () => {
    garageFixture();
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit bike' }));
    change('Bike name', 'Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Create bike' }));
    expect(screen.getByLabelText('Bike name')).toHaveValue('Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Bike name')).toHaveValue('Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Create bike' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Bike name')).toHaveValue('');
});

it('cancelRetainsFormUntilExplicitDiscard', async () => {
    garageFixture();
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit bike' }));
    change('Bike name', 'Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Bike name')).toHaveValue('Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Bike name')).toHaveValue('Attempt');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByLabelText('Bike name')).not.toBeInTheDocument();
});
it('serverDisplayNameReplacesCardsAndHeroAfterEdit', async () => {
    garageFixture();
    api.editBike.mockImplementation(async () => {
        const saved = {
            ...bike,
            name: null,
            displayName: 'Trek Domane',
            version: 10,
        };
        api.listBikes.mockResolvedValue({ items: [saved], nextCursor: null });
        api.getBike.mockResolvedValue(saved);
        api.getOverview.mockResolvedValue({
            bike: saved,
            rideCount: 0,
            recordedDistanceMetres: 0,
            maintenanceRecordCount: 0,
            currentComponents: [],
            allocationGaps: [],
            spendingByCurrency: [],
            unknownCostRecordCount: 0,
            recentActivity: [],
        });
        return saved;
    });
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit bike' }));
    change('Bike name', '');
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    expect(
        await screen.findByRole('heading', { name: 'Trek Domane' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Trek Domane/ })).toBeVisible();
});
it('uncertainCreationShowsSavedBikesForReviewBeforeResubmit', async () => {
    api.createBike.mockRejectedValueOnce(new Error('lost'));
    api.listBikes.mockResolvedValue({
        items: [{ ...bike, displayName: 'Already saved' }],
        nextCursor: 'more',
    });
    mount();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Refresh saved data' }),
    );
    expect(
        await screen.findByRole('heading', { name: 'Already saved' }),
    ).toBeVisible();
    expect(screen.getByText(/More bikes exist/)).toBeVisible();
    expect(api.createBike).toHaveBeenCalledTimes(1);
});
it('uncertainCreateReviewLoadsOpaqueNextPageWithoutWriting', async () => {
    api.createBike.mockRejectedValueOnce(new Error('lost'));
    api.listBikes.mockImplementation(async (page) =>
        page.cursor
            ? {
                  items: [{ ...bike, id: b, displayName: 'Second saved' }],
                  nextCursor: null,
              }
            : { items: [bike], nextCursor: 'opaque' },
    );
    mount();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    fireEvent.click(
        await screen.findByRole('button', { name: 'Refresh saved data' }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Load more saved bikes' }),
    );
    expect(
        await screen.findByRole('heading', { name: 'Second saved' }),
    ).toBeVisible();
    expect(screen.getByLabelText('Make')).toHaveValue(' Trek ');
    expect(api.listBikes).toHaveBeenLastCalledWith({
        pageSize: 50,
        cursor: 'opaque',
    });
    expect(api.createBike).toHaveBeenCalledTimes(1);
});
it('emptyBikeLinksToFittingWithoutInventingParts', async () => {
    garageFixture();
    render(<Home />);
    const fit = await screen.findByRole('button', { name: 'Fit component →' });
    expect(screen.getAllByText('Not fitted')).toHaveLength(5);
    fireEvent.click(fit);
    await waitFor(() =>
        expect(window.location.search).toContain('view=components'),
    );
    expect(api.createBike).not.toHaveBeenCalled();
});
it('required make error is associated with the real input', () => {
    mount();
    fireEvent.click(screen.getByText('Save bike'));
    expect(screen.getByLabelText('Make')).toHaveAttribute(
        'aria-invalid',
        'true',
    );
    expect(screen.getByLabelText('Make')).toHaveAccessibleDescription(
        'Make is required.',
    );
});
