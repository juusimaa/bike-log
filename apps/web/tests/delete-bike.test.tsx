import { beforeEach, expect, it, vi } from 'vitest';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@bikelog/api-client';
import { DeleteBikeDialog } from '../src/features/bikes/DeleteBikeDialog';
import { HomeClient as Home } from '../src/components/HomeClient';
import { catalog, overviewExtras } from './catalog-fixture';
const a = '11111111-1111-1111-1111-111111111111',
    b = '22222222-2222-2222-2222-222222222222';
const bike = {
    id: a,
    name: 'Canyon',
    displayName: 'Canyon',
    make: 'Canyon',
    model: 'Grail',
    kind: 'gravel' as const,
    year: 2024,
    color: null,
    version: 3,
    frameWeightGrams: null,
    missingPositions: [] as string[],
    status: 'active' as 'active' | 'retired',
};
const part = (n: number, type: string, position: string) => ({
    installationId: `00000000-0000-0000-0000-00000000000${n}`,
    componentId: `00000000-0000-0000-0000-00000000010${n}`,
    type,
    make: 'Synthetic',
    model: `Part ${n}`,
    position,
});
const chain = part(1, 'chain', 'chain'),
    front = part(2, 'rim', 'front-rim'),
    rear = part(3, 'rim', 'rear-rim');
const preview = {
    bikeVersion: 3,
    fittedParts: [chain, front, rear],
    rideCount: 12,
    maintenanceCount: 1,
};
const api = vi.hoisted(() => ({
    getBikeDeletionPreview: vi.fn(),
    deleteBike: vi.fn(),
    getComponentCatalog: vi.fn(),
    listBikes: vi.fn(),
    getBike: vi.fn(),
    getOverview: vi.fn(),
    getReminder: vi.fn(),
    listInstallations: vi.fn(),
    listExemptions: vi.fn(),
}));
vi.mock('../src/lib/api', () => ({ getApi: () => api }));
beforeEach(() => {
    vi.resetAllMocks();
    window.history.replaceState(null, '', '/');
    api.getBikeDeletionPreview.mockResolvedValue(preview);
    api.deleteBike.mockResolvedValue(undefined);
    api.getComponentCatalog.mockResolvedValue(catalog);
});
function mount(onDeleted = vi.fn()) {
    render(
        <QueryClientProvider
            client={
                new QueryClient({
                    defaultOptions: { queries: { retry: false } },
                })
            }
        >
            <DeleteBikeDialog
                bike={bike}
                onDeleted={onDeleted}
                onCancel={() => {}}
            />
        </QueryClientProvider>,
    );
    return onDeleted;
}
function tick(model: string) {
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(model) }));
}
it('listsEveryFittedPartUntickedWithCountsAndAWarning', async () => {
    mount();
    const dialog = screen.getByRole('dialog', { name: 'Delete Canyon?' });
    const boxes = await within(dialog).findAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(
        within(dialog).getByRole('checkbox', { name: /Part 2.*Front rim/ }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent('12 rides stay in All rides');
    expect(dialog).toHaveTextContent('1 maintenance record, chain reminder');
    expect(dialog).toHaveTextContent('This cannot be undone.');
});
it('confirmingSendsThePreviewVersionInstallationsAndTickedParts', async () => {
    const deleted = mount();
    await screen.findAllByRole('checkbox');
    tick('Part 2');
    tick('Part 3');
    fireEvent.click(
        screen.getByRole('button', { name: 'Delete bike, keep 2 parts' }),
    );
    await waitFor(() => expect(deleted).toHaveBeenCalledWith(a));
    expect(api.deleteBike).toHaveBeenCalledWith(a, {
        expectedVersion: 3,
        fittedInstallationIds: [
            chain.installationId,
            front.installationId,
            rear.installationId,
        ],
        keepComponentIds: [front.componentId, rear.componentId],
    });
});
it('changedPartsRefreshTheListAndKeepTicksForPartsStillThere', async () => {
    const pedals = part(4, 'pedals', 'pedals');
    api.deleteBike.mockRejectedValueOnce(
        new ApiError(409, 'bike_parts_changed', 'Changed'),
    );
    const deleted = mount();
    await screen.findAllByRole('checkbox');
    tick('Part 1');
    tick('Part 2');
    api.getBikeDeletionPreview.mockResolvedValue({
        ...preview,
        fittedParts: [front, rear, pedals],
    });
    fireEvent.click(
        screen.getByRole('button', { name: 'Delete bike, keep 2 parts' }),
    );
    expect(
        await screen.findByText(/This bike changed since you opened/),
    ).toBeVisible();
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(3));
    expect(
        screen.getByRole('checkbox', { name: /Part 2/ }),
    ).toBeChecked();
    expect(
        screen.getByRole('checkbox', { name: /Part 4/ }),
    ).not.toBeChecked();
    expect(deleted).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole('button', { name: 'Delete bike, keep 1 part' }),
    );
    await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
    expect(api.deleteBike).toHaveBeenLastCalledWith(a, {
        expectedVersion: 3,
        fittedInstallationIds: [
            front.installationId,
            rear.installationId,
            pedals.installationId,
        ],
        keepComponentIds: [front.componentId],
    });
});
function garage(bikes: (typeof bike)[]) {
    let remaining = bikes;
    api.listBikes.mockImplementation(async () => ({
        items: remaining,
        nextCursor: null,
    }));
    api.getBike.mockImplementation(async (id) => {
        const found = remaining.find((x) => x.id === id);
        if (!found) throw new ApiError(404, 'not_found', 'Missing');
        return found;
    });
    api.getOverview.mockImplementation(async (id) => ({
        bike: remaining.find((x) => x.id === id) ?? bike,
        rideCount: 0,
        recordedDistanceMetres: 0,
        maintenanceRecordCount: 0,
        currentComponents: [],
        allocationGaps: [],
        spendingByCurrency: [],
        unknownCostRecordCount: 0,
        recentActivity: [],
        ...overviewExtras(),
    }));
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
    api.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
    api.listExemptions.mockResolvedValue([]);
    api.deleteBike.mockImplementation(async (id) => {
        remaining = remaining.filter((x) => x.id !== id);
    });
}
it('afterDeletingTheGarageSelectsAnotherBike', async () => {
    garage([
        bike,
        { ...bike, id: b, name: 'Retired', displayName: 'Retired', status: 'retired' },
    ]);
    window.history.replaceState(null, '', `/?bike=${a}`);
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete bike…' }));
    await screen.findAllByRole('checkbox');
    fireEvent.click(screen.getByRole('button', { name: 'Delete bike' }));
    await waitFor(() =>
        expect(window.location.search).toBe(`?bike=${b}&view=overview`),
    );
    expect(await screen.findByText('Canyon deleted.')).toBeInTheDocument();
    expect(
        await screen.findByRole('heading', { name: /^Retired/ }),
    ).toBeVisible();
});
it('deletingTheLastBikeShowsTheEmptyGarage', async () => {
    garage([bike]);
    window.history.replaceState(null, '', `/?bike=${a}`);
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete bike…' }));
    await screen.findAllByRole('checkbox');
    fireEvent.click(screen.getByRole('button', { name: 'Delete bike' }));
    expect(
        await screen.findByRole('heading', { name: 'Your garage is empty' }),
    ).toBeVisible();
});
