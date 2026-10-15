import { beforeEach, expect, it, vi } from 'vitest';
import {
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RideListItem, Validated } from '@bikelog/api-client';
import { AllRides } from '../src/features/rides/AllRides';
import { Workspace } from '../src/features/garage/Workspace';
import { catalog, overviewExtras } from './catalog-fixture';
const a = '11111111-1111-1111-1111-111111111111',
    r = '22222222-2222-2222-2222-222222222222',
    d = '33333333-3333-3333-3333-333333333333';
const ride = (
    id: string,
    name: string,
    bike: RideListItem['bike'],
): Validated<RideListItem> => ({
    id,
    bikeId: bike.id,
    name,
    startUtc: '2026-10-02T06:30:00Z',
    distanceMetres: 42000,
    durationSeconds: 5400,
    version: 1,
    bike,
});
const rides = [
    ride('44444444-4444-4444-4444-444444444441', 'Commute', {
        id: a,
        displayName: 'Road',
        state: 'active',
    }),
    ride('44444444-4444-4444-4444-444444444442', 'Gravel loop', {
        id: r,
        displayName: 'Old gravel',
        state: 'retired',
    }),
    ride('44444444-4444-4444-4444-444444444443', 'Canyon day', {
        id: d,
        displayName: 'Canyon',
        state: 'deleted',
    }),
];
const bike = {
    id: a,
    name: 'Road',
    displayName: 'Road',
    make: null,
    model: null,
    kind: null,
    year: null,
    color: null,
    version: 1,
    frameWeightGrams: null,
    missingPositions: [] as string[],
    status: 'active' as const,
};
const api = vi.hoisted(() => ({
    listAllRides: vi.fn(),
    listBikes: vi.fn(),
    getBike: vi.fn(),
    getOverview: vi.fn(),
    listInstallations: vi.fn(),
    getComponentCatalog: vi.fn(),
    listExemptions: vi.fn(),
    getReminder: vi.fn(),
    listRides: vi.fn(),
}));
vi.mock('../src/lib/api', () => ({ getApi: () => api }));
beforeEach(() => {
    vi.resetAllMocks();
    window.history.replaceState(null, '', '/');
    api.listAllRides.mockResolvedValue({ items: rides, nextCursor: null });
    api.listBikes.mockResolvedValue({
        items: [
            bike,
            { ...bike, id: r, displayName: 'Old gravel', status: 'retired' },
        ],
        nextCursor: null,
    });
    api.getBike.mockImplementation(async (id) =>
        id === r
            ? { ...bike, id: r, displayName: 'Old gravel', status: 'retired' }
            : bike,
    );
    api.getOverview.mockImplementation(async () => ({
        bike,
        evaluatedAtUtc: '2026-10-03T00:00:00Z',
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
    api.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
    api.getComponentCatalog.mockResolvedValue(catalog);
    api.listExemptions.mockResolvedValue([]);
    api.listRides.mockResolvedValue({ items: [], nextCursor: null });
});
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
function row(name: string) {
    return screen.getByRole('row', { name: new RegExp(name) });
}
it('namesEachRidesBikeWithLinksForExistingBikesAndTagsForOthers', async () => {
    const open = vi.fn();
    mount(<AllRides onOpenBike={open} />);
    await screen.findByText('Commute');
    expect(
        within(row('Commute')).getByRole('link', { name: 'Road' }),
    ).toHaveAttribute('href', `/?bike=${a}&view=overview`);
    const retired = row('Gravel loop');
    expect(
        within(retired).getByRole('link', { name: 'Old gravel' }),
    ).toHaveAttribute('href', `/?bike=${r}&view=overview`);
    expect(within(retired).getByText('Retired')).toBeVisible();
    const deleted = row('Canyon day');
    expect(within(deleted).queryByRole('link')).toBeNull();
    expect(within(deleted).getByText('Canyon')).toBeVisible();
    expect(within(deleted).getByText('Deleted')).toBeVisible();
    fireEvent.click(within(row('Commute')).getByRole('link', { name: 'Road' }));
    expect(open).toHaveBeenCalledWith(a);
});
it('loadMoreFetchesTheNextCursor', async () => {
    api.listAllRides.mockImplementation(async (page) =>
        page.cursor
            ? { items: rides.slice(1), nextCursor: null }
            : { items: rides.slice(0, 1), nextCursor: 'opaque' },
    );
    mount(<AllRides />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Canyon day')).toBeVisible();
    expect(api.listAllRides.mock.calls[1][0]).toEqual({
        pageSize: 50,
        cursor: 'opaque',
    });
});
it('workspaceAllRidesOpensTheCorrectAndDeleteDialogs', async () => {
    window.history.replaceState(null, '', `/?bike=${a}&view=all-rides`);
    mount(<Workspace />);
    expect(
        await screen.findByRole('heading', { name: 'Every ride, every bike.' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'All rides' })).toHaveAttribute(
        'aria-current',
        'page',
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Correct Canyon day' }),
    );
    expect(
        await screen.findByRole('dialog', { name: 'Correct ride on Canyon' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Commute' }));
    expect(
        await screen.findByRole('dialog', { name: 'Delete ride?' }),
    ).toBeVisible();
});
it('workspaceAllRidesBikeLinkOpensThatBike', async () => {
    window.history.replaceState(null, '', `/?bike=${a}&view=all-rides`);
    mount(<Workspace />);
    await screen.findByText('Gravel loop');
    fireEvent.click(
        within(row('Gravel loop')).getByRole('link', { name: 'Old gravel' }),
    );
    await waitFor(() =>
        expect(window.location.search).toBe(`?bike=${r}&view=overview`),
    );
});
