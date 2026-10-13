import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FitComponentForm } from '../src/features/components/FitComponentForm';
import { ReplacementForm } from '../src/features/components/ReplacementForm';
import {
    Components,
    type JustFitted,
} from '../src/features/components/Components';
import { invalidateBike } from '../src/lib/query';
import {
    ExemptionDialog,
    MoveDialog,
    RemoveDialog,
} from '../src/features/components/PositionDialogs';
import { BikeSwitcher } from '../src/components/BikeSwitcher';
import { BikeForm } from '../src/features/bikes/BikeForm';
import { RideForm } from '../src/features/rides/RideForm';
import { Stats } from '../src/features/overview/Stats';
import { Overview } from '../src/features/overview/Overview';
import { catalog, overviewExtras, status } from './catalog-fixture';
const api = vi.hoisted(() => ({
    getComponentCatalog: vi.fn(),
    getOverview: vi.fn(),
    getBike: vi.fn(),
    listBikes: vi.fn(),
    listComponents: vi.fn(),
    listInstallations: vi.fn(),
    listExemptions: vi.fn(),
    getComponent: vi.fn(),
    getComponentUsage: vi.fn(),
    createComponent: vi.fn(),
    createInstallation: vi.fn(),
    fitPair: vi.fn(),
    replaceWithService: vi.fn(),
    replaceInstallation: vi.fn(),
    moveInstallation: vi.fn(),
    correctInstallation: vi.fn(),
    createExemption: vi.fn(),
    correctExemption: vi.fn(),
    createBike: vi.fn(),
    createRide: vi.fn(),
}));
vi.mock('../src/lib/api', () => ({ getApi: () => api }));
const bike = (id: string, name: string, missing: string[] = []) => ({
    id,
    name,
    displayName: name,
    make: 'Synthetic',
    model: 'Frame',
    kind: 'road' as const,
    year: 2026,
    color: null,
    version: 1,
    frameWeightGrams: null,
    missingPositions: missing,
});
const installation = (
    id: string,
    position: string,
    bikeId = 'b1',
    version = 3,
) => ({
    id,
    bikeId,
    componentId: `c-${id}`,
    position,
    startUtc: '2026-01-01T00:00:00Z',
    endUtc: null as string | null,
    version,
});
const part = (
    id: string,
    type: string,
    installations: ReturnType<typeof installation>[] = [],
    model = 'Part',
) => ({
    id,
    type,
    make: 'Synthetic',
    model,
    version: 1,
    installations,
    initialUsageEstimateMetres: 0,
    group: 'build',
    weightGrams: null as number | null,
});
function overview(
    bikeId = 'b1',
    overrides: Parameters<typeof overviewExtras>[0] = {},
) {
    return {
        bike: bike(bikeId, bikeId === 'b1' ? 'Road' : 'Gravel'),
        evaluatedAtUtc: '2026-10-13T00:00:00Z',
        rideCount: 0,
        recordedDistanceMetres: 0,
        currentComponents: [],
        allocationGaps: [],
        spendingByCurrency: [],
        unknownCostRecordCount: 0,
        maintenanceRecordCount: 0,
        recentActivity: [],
        reminder: null,
        ...overviewExtras(overrides),
    };
}
function mount(node: React.ReactNode) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['catalog'], catalog);
    return render(
        <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    );
}
function date(label: string, value = '2026-10-01T12:00') {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
beforeEach(() => {
    vi.resetAllMocks();
    api.getComponentCatalog.mockResolvedValue(catalog);
    api.getOverview.mockImplementation(async (id: string) => overview(id));
    api.listBikes.mockResolvedValue({
        items: [bike('b1', 'Road'), bike('b2', 'Gravel')],
        nextCursor: null,
    });
    api.getBike.mockImplementation(async (id: string) =>
        bike(id, id === 'b1' ? 'Road' : 'Gravel'),
    );
    api.listComponents.mockResolvedValue({ items: [], nextCursor: null });
    api.listInstallations.mockResolvedValue({ items: [], nextCursor: null });
    api.listExemptions.mockResolvedValue([]);
    api.getComponentUsage.mockResolvedValue({
        combinedLifetimeMetres: 0,
        initialUsageEstimateMetres: 0,
    });
    api.createComponent.mockImplementation(async (input) => ({
        ...part('new', input.type),
        ...input,
    }));
    api.createInstallation.mockResolvedValue(installation('new-i', 'saddle'));
});
it('fitSendsTypeFromCatalogPositionAndWeight', async () => {
    const saved = vi.fn();
    mount(
        <FitComponentForm
            bikeId="b1"
            position="saddle"
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    expect(
        screen.getByRole('heading', { name: 'Fit saddle' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Make'), {
        target: { value: 'Fizik' },
    });
    fireEvent.change(screen.getByLabelText('Model'), {
        target: { value: 'Argo' },
    });
    fireEvent.change(screen.getByLabelText('Weight (g)'), {
        target: { value: '215' },
    });
    date('Date and time');
    fireEvent.click(screen.getByText('Fit part'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.createComponent).toHaveBeenCalledWith({
        type: 'saddle',
        make: 'Fizik',
        model: 'Argo',
        weightGrams: 215,
    });
});
it('zeroWeightIsAFieldErrorWithoutWrites', () => {
    mount(
        <FitComponentForm
            bikeId="b1"
            position="saddle"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.change(screen.getByLabelText('Make'), {
        target: { value: 'Fizik' },
    });
    fireEvent.change(screen.getByLabelText('Model'), {
        target: { value: 'Argo' },
    });
    fireEvent.change(screen.getByLabelText('Weight (g)'), {
        target: { value: '0' },
    });
    fireEvent.click(screen.getByText('Fit part'));
    expect(screen.getByLabelText('Weight (g)')).toHaveAttribute(
        'aria-invalid',
        'true',
    );
    expect(api.createComponent).not.toHaveBeenCalled();
});
it('pairOptionAppearsForFrontBrakeAndSendsOneRequest', async () => {
    api.fitPair.mockResolvedValue({
        front: {
            component: part('f', 'brake'),
            installation: installation('fi', 'front-brake'),
        },
        rear: {
            component: part('r', 'brake'),
            installation: installation('ri', 'rear-brake'),
        },
    });
    const saved = vi.fn();
    mount(
        <FitComponentForm
            bikeId="b1"
            position="front-brake"
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    const pair = await screen.findByRole('checkbox', {
        name: /Also fit to the rear brake/,
    });
    expect(pair).toBeChecked();
    fireEvent.change(screen.getByLabelText('Make'), {
        target: { value: 'Shimano' },
    });
    fireEvent.change(screen.getByLabelText('Model'), {
        target: { value: 'GRX' },
    });
    fireEvent.click(screen.getByText('Fit part'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.fitPair).toHaveBeenCalledTimes(1);
    expect(api.fitPair.mock.calls[0][0]).toMatchObject({
        bikeId: 'b1',
        type: 'brake',
        make: 'Shimano',
        model: 'GRX',
    });
    expect(api.createComponent).not.toHaveBeenCalled();
});
it('saddleOffersNoPairOption', async () => {
    mount(
        <FitComponentForm
            bikeId="b1"
            position="saddle"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    await waitFor(() => expect(api.getOverview).toHaveBeenCalled());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
const fitted = installation('i-old', 'rear-tyre', 'b1', 7);
const oldTyre = part('c-old', 'tyre', [fitted], 'Old');
it('replacementSendsWeightUnderTheCatalogLabel', async () => {
    api.replaceWithService.mockResolvedValue({
        component: part('new', 'tyre'),
        oldInstallation: fitted,
        newInstallation: installation('n', 'rear-tyre'),
        maintenance: { id: 'm' },
    });
    const saved = vi.fn();
    mount(
        <ReplacementForm
            installation={fitted}
            component={oldTyre}
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    expect(
        await screen.findByRole('heading', { name: 'Replace rear tyre' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Make'), {
        target: { value: 'Conti' },
    });
    fireEvent.change(screen.getByLabelText('Model'), {
        target: { value: 'GP5000' },
    });
    fireEvent.change(screen.getByLabelText('Weight (g)'), {
        target: { value: '250' },
    });
    date('Date and time');
    fireEvent.click(screen.getByText('Replace part'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.replaceWithService.mock.calls[0][1]).toMatchObject({
        newWeightGrams: 250,
        expectedInstallationVersion: 7,
    });
});
it('replacementFromGarageListsOnlyUnfittedSameTypeParts', async () => {
    api.listComponents.mockResolvedValue({
        items: [
            part('spare', 'tyre', [], 'Spare tyre'),
            part('pedals', 'pedals', [], 'Pedals'),
            part(
                'busy',
                'tyre',
                [installation('x', 'front-tyre', 'b2')],
                'Busy',
            ),
        ],
        nextCursor: null,
    });
    api.replaceInstallation.mockResolvedValue({});
    const saved = vi.fn();
    mount(
        <ReplacementForm
            installation={fitted}
            component={oldTyre}
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    fireEvent.click(screen.getByLabelText(/From your garage/));
    fireEvent.click(await screen.findByRole('radio', { name: /Spare tyre/ }));
    expect(screen.queryByRole('radio', { name: /Pedals/ })).toBeNull();
    expect(screen.queryByRole('radio', { name: /Busy/ })).toBeNull();
    date('Replaced on');
    fireEvent.click(screen.getByText('Replace part'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.replaceInstallation.mock.calls[0]).toEqual([
        'i-old',
        expect.objectContaining({
            newComponentId: 'spare',
            expectedInstallationVersion: 7,
        }),
    ]);
});
it('replacementFromAnotherBikeIsOneMoveWithBothVersions', async () => {
    const donor = installation('donor', 'rear-tyre', 'b2', 4);
    api.listComponents.mockResolvedValue({
        items: [part('donor-part', 'tyre', [donor], 'Donor tyre')],
        nextCursor: null,
    });
    api.moveInstallation.mockResolvedValue({});
    const saved = vi.fn();
    mount(
        <ReplacementForm
            installation={fitted}
            component={oldTyre}
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    fireEvent.click(screen.getByLabelText(/From another bike/));
    fireEvent.click(
        await screen.findByRole('radio', { name: /Donor tyre.*Gravel/ }),
    );
    expect(screen.getByText(/Gravel will be incomplete/)).toBeInTheDocument();
    date('Replaced on');
    fireEvent.click(screen.getByText('Replace part'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.moveInstallation).toHaveBeenCalledTimes(1);
    expect(api.moveInstallation.mock.calls[0]).toEqual([
        'donor',
        expect.objectContaining({
            toBikeId: 'b1',
            toPosition: 'rear-tyre',
            expectedInstallationVersion: 4,
            expectedDestinationInstallationVersion: 7,
        }),
    ]);
});
const saddle = installation('i-saddle', 'saddle', 'b1', 5);
const saddlePart = part('c-saddle', 'saddle', [saddle], 'Argo');
it('moveIntoAnOccupiedPositionWarnsAndSendsBothVersions', async () => {
    const occupant = installation('i-occ', 'saddle', 'b2', 9);
    api.getOverview.mockImplementation(async (id: string) =>
        overview(
            id,
            id === 'b2'
                ? {
                      saddle: status('saddle', 'fitted', {
                          componentId: 'c-occ',
                          installationId: 'i-occ',
                      }),
                  }
                : {},
        ),
    );
    api.getComponent.mockResolvedValue(
        part('c-occ', 'saddle', [occupant], 'Volt'),
    );
    api.moveInstallation.mockResolvedValue({});
    const saved = vi.fn();
    mount(
        <MoveDialog
            installation={saddle}
            component={saddlePart}
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    expect(
        await screen.findByText(
            /Volt comes off Gravel and goes to your garage/,
        ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Road will be incomplete/)).toBeInTheDocument();
    date('Moved on');
    fireEvent.click(screen.getByText('Move part'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.moveInstallation).toHaveBeenCalledTimes(1);
    expect(api.moveInstallation.mock.calls[0][1]).toMatchObject({
        toBikeId: 'b2',
        toPosition: 'saddle',
        expectedInstallationVersion: 5,
        expectedDestinationInstallationVersion: 9,
    });
});
it('moveIntoAnEmptyPositionSendsOnlyTheSourceVersion', async () => {
    api.moveInstallation.mockResolvedValue({});
    const saved = vi.fn();
    mount(
        <MoveDialog
            installation={saddle}
            component={saddlePart}
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    await screen.findByRole('option', { name: /Saddle — empty/ });
    date('Moved on');
    fireEvent.click(screen.getByText('Move part'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(
        api.moveInstallation.mock.calls[0][1]
            .expectedDestinationInstallationVersion,
    ).toBeUndefined();
});
it('removeEndsTheInstallationWithItsVersion', async () => {
    api.correctInstallation.mockResolvedValue({});
    const saved = vi.fn();
    mount(
        <RemoveDialog
            installation={saddle}
            component={saddlePart}
            bikeName="Road"
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    date('Removed on');
    fireEvent.click(screen.getByText('Remove part'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.correctInstallation.mock.calls[0]).toEqual([
        'i-saddle',
        expect.objectContaining({
            startUtc: saddle.startUtc,
            expectedVersion: 5,
        }),
    ]);
    expect(api.correctInstallation.mock.calls[0][1].endUtc).toBeTruthy();
});
it('incompleteBikeShowsBadgeAndRideWarningWithoutBlockingSave', async () => {
    mount(
        <BikeSwitcher
            bikes={[bike('b1', 'Road', ['saddle'])]}
            current={bike('b1', 'Road', ['saddle'])}
            bikeId="b1"
            onSelect={() => {}}
            hasMore={false}
            loading={false}
            onLoadMore={() => {}}
        />,
    );
    expect(screen.getByText('1 part missing')).toBeInTheDocument();
    expect(screen.getByText('1 incomplete')).toBeInTheDocument();
    api.getBike.mockResolvedValue(bike('b1', 'Road', ['saddle']));
    mount(<RideForm bikeId="b1" onSaved={() => {}} onCancel={() => {}} />);
    expect(
        await screen.findByText(/This bike is missing a saddle/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/ })).toBeEnabled();
});
it('switchingToTubelessSendsPositionDateAndTubeVersion', async () => {
    const tube = installation('i-tube', 'rear-inner-tube', 'b1', 2);
    api.createExemption.mockResolvedValue({});
    const saved = vi.fn();
    mount(
        <ExemptionDialog
            bikeId="b1"
            position="rear-inner-tube"
            fitted={{
                installation: tube,
                component: part('c-tube', 'inner-tube', [tube], 'Tube'),
            }}
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    expect(
        screen.getByRole('heading', { name: 'Switch rear wheel to tubeless' }),
    ).toBeInTheDocument();
    date('From', '2026-08-01T12:00');
    fireEvent.click(screen.getByText('Switch to tubeless'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.createExemption.mock.calls[0][0]).toBe('b1');
    expect(api.createExemption.mock.calls[0][1]).toMatchObject({
        position: 'rear-inner-tube',
        expectedInstallationVersion: 2,
    });
    expect(api.createExemption.mock.calls[0][1].startUtc).toMatch(
        /^2026-08-01T/,
    );
});
it('tubelessWheelHidesFitAndListsHistory', async () => {
    api.getOverview.mockResolvedValue(
        overview('b1', {
            'rear-inner-tube': status('rear-inner-tube', 'exempt', {
                reason: 'tubeless',
                exemptionId: 'e2',
                sinceUtc: '2026-09-20T10:00:00Z',
            }),
        }),
    );
    api.listExemptions.mockResolvedValue([
        {
            id: 'e2',
            bikeId: 'b1',
            position: 'rear-inner-tube',
            reason: 'tubeless',
            startUtc: '2026-09-20T10:00:00Z',
            endUtc: null,
            version: 1,
        },
        {
            id: 'e1',
            bikeId: 'b1',
            position: 'rear-inner-tube',
            reason: 'tubeless',
            startUtc: '2026-08-01T10:00:00Z',
            endUtc: '2026-09-15T10:00:00Z',
            version: 2,
        },
    ]);
    const request = vi.fn();
    mount(<Components bikeId="b1" onFit={() => {}} onRequest={request} />);
    expect(
        await screen.findByText('Not applicable (tubeless)'),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Fit rear inner tube' }),
    ).toBeNull();
    expect(
        screen.getByRole('button', { name: 'Fit front inner tube' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Rear wheel: tubeless')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(
        /^Rear wheel tubeless 20 Sept? 2026 – now$/,
    );
    expect(items[1]).toHaveTextContent(
        /^Rear wheel tubeless 1 Aug 2026 – 15 Sept? 2026$/,
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Switch rear wheel to tubed' }),
    );
    expect(request).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'end-exemption' }),
    );
});
it('frameWeightIsValidatedBeforeSaving', async () => {
    mount(<BikeForm onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Make'), {
        target: { value: 'Canyon' },
    });
    fireEvent.change(screen.getByLabelText('Model'), {
        target: { value: 'Grizl' },
    });
    fireEvent.change(screen.getByLabelText('Year'), {
        target: { value: '2025' },
    });
    fireEvent.change(screen.getByLabelText('Kind'), {
        target: { value: 'gravel' },
    });
    fireEvent.change(screen.getByLabelText('Frame weight (g)'), {
        target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save bike' }));
    expect(screen.getByLabelText('Frame weight (g)')).toHaveAttribute(
        'aria-invalid',
        'true',
    );
    expect(api.createBike).not.toHaveBeenCalled();
});
it('weightTotalIsLabelledIncompleteWhenPartsLackWeight', () => {
    const snapshot = overview();
    snapshot.weights = {
        ...snapshot.weights,
        totalGrams: 1825,
        frameGrams: 1180,
        missingCount: 1,
    };
    mount(<Stats snapshot={snapshot as never} />);
    expect(screen.getByText('1.83 kg')).toBeInTheDocument();
    expect(
        screen.getByText('Incomplete: 1 part without weight'),
    ).toBeInTheDocument();
});
it('overviewSummarisesGapsPerPositionAndFoldsTheRest', async () => {
    const snapshot = overview();
    snapshot.positionGaps = ['saddle', 'pedals', 'fork', 'chain'].map(
        (position) => ({
            position,
            rideCount: 12,
            firstRideStartUtc: '2026-01-03T10:00:00Z',
            lastRideStartUtc: '2026-05-30T10:00:00Z',
        }),
    );
    api.getOverview.mockResolvedValue(snapshot);
    mount(<Overview bikeId="b1" />);
    const saddle = await screen.findByText('Saddle');
    expect(saddle.parentElement).toHaveTextContent(
        'Saddle not recorded for 12 rides',
    );
    expect(screen.queryByText('Chain')).toBeNull();
    fireEvent.click(
        screen.getByRole('button', { name: 'Show all 4 positions' }),
    );
    expect(screen.getByText('Chain')).toBeInTheDocument();
});
it('switcherSearchesAndChoosesWithTheKeyboard', async () => {
    const select = vi.fn();
    mount(
        <BikeSwitcher
            bikes={[
                bike('b1', 'Road'),
                { ...bike('b2', 'Gravel'), year: 2019 },
                bike('b3', 'Winter', ['chain']),
            ]}
            current={bike('b1', 'Road')}
            bikeId="b1"
            onSelect={select}
            hasMore={false}
            loading={false}
            onLoadMore={() => {}}
        />,
    );
    const trigger = screen.getByRole('button', { name: /Road.*Change bike/ });
    expect(screen.getByText(/^3 bikes in your garage/)).toBeInTheDocument();
    fireEvent.click(trigger);
    const search = screen.getByRole('searchbox', { name: 'Search bikes' });
    await waitFor(() => expect(search).toHaveFocus());
    fireEvent.change(search, { target: { value: '2019' } });
    expect(screen.getByText('1 match')).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(select).toHaveBeenCalledWith('b2');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: 'Choose a bike' })).toBeNull();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole('searchbox'), {
        target: { value: 'tandem' },
    });
    expect(screen.getByText(/No bike matches “tandem”/)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Choose a bike' })).toBeNull();
    expect(trigger).toHaveFocus();
});
it('fitThenNextCarriesTheDateToTheNextEmptyPositionInTheGroup', async () => {
    const saved = vi.fn();
    api.createInstallation.mockResolvedValue(installation('new-i', 'fork'));
    mount(
        <FitComponentForm
            bikeId="b1"
            position="fork"
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    const next = await screen.findByRole('button', {
        name: 'Fit, then bottom bracket',
    });
    fireEvent.change(screen.getByLabelText('Make'), {
        target: { value: 'Columbus' },
    });
    fireEvent.change(screen.getByLabelText('Model'), {
        target: { value: 'Futura' },
    });
    date('Date and time');
    fireEvent.click(next);
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(saved.mock.calls[0][1]).toEqual({
        positions: ['fork'],
        next: {
            position: 'bottom-bracket',
            wall: '2026-10-01T12:00',
            offset: '',
        },
    });
});
it('notRecordedPanelStaysOpenAndHandsFocusToTheNextFit', async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['catalog'], catalog);
    const board = (justFitted?: JustFitted) => (
        <QueryClientProvider client={client}>
            <Components bikeId="b1" onFit={() => {}} justFitted={justFitted} />
        </QueryClientProvider>
    );
    const { rerender } = render(board());
    const fork = await screen.findByRole('button', { name: 'Fit fork' });
    const panel = fork.closest('details')!;
    // Nothing recorded in the group yet, so its panel starts open.
    expect(panel).toHaveAttribute('open');
    api.getOverview.mockResolvedValue(
        overview('b1', {
            fork: status('fork', 'fitted', {
                sinceUtc: '2026-10-01T09:00:00Z',
            }),
        }),
    );
    await invalidateBike(client, 'b1');
    rerender(board({ bikeId: 'b1', positions: ['fork'], seq: 1, focus: true }));
    await screen.findByText('Fitted');
    // The group now has a fitted row, but the panel keeps the state it had.
    const rest = screen.getByRole('button', { name: 'Fit bottom bracket' });
    expect(rest.closest('details')).toHaveAttribute('open');
    await waitFor(() => expect(rest).toHaveFocus());
    expect(screen.getByText('Fitted').closest('.pos-row')).toHaveClass(
        'just-fitted',
    );
});
