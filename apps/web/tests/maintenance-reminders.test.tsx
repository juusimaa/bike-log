import { beforeEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@bikelog/api-client';
import { Maintenance } from '../src/features/maintenance/Maintenance';
import { MaintenanceForm } from '../src/features/maintenance/MaintenanceForm';
import { ReminderCard } from '../src/features/reminders/ReminderCard';
import { Workspace } from '../src/features/garage/Workspace';
import { ReminderForm } from '../src/features/reminders/ReminderForm';
const api = vi.hoisted(() => ({
    listBikes: vi.fn(),
    getBike: vi.fn(),
    getOverview: vi.fn(),
    getBikeMaintenance: vi.fn(),
    listInstallations: vi.fn(),
    getComponent: vi.fn(),
    createMaintenance: vi.fn(),
    getReminder: vi.fn(),
    editReminder: vi.fn(),
}));
vi.mock('../src/lib/api', () => ({ getApi: () => api }));
const evaluation = {
    ruleVersion: 7,
    state: 'ready',
    enabled: true,
    method: 'oil' as const,
    oilThresholdMetres: 150000,
    waxThresholdMetres: 300000,
    activeThresholdMetres: 150000,
    evaluatedAtUtc: '2025-03-01T00:00:00Z',
    componentId: 'new-chain',
    installationId: 'new-i',
    baselineKind: 'installation',
    baselineUtc: '2025-01-01T00:00:00Z',
    distanceSinceBaselineMetres: 160000,
    remainingMetres: 0,
    due: true,
};
const installs = [
    {
        id: 'old-i',
        bikeId: 'b1',
        componentId: 'old-chain',
        position: 'chain',
        startUtc: '2024-01-01T00:00:00Z',
        endUtc: '2025-01-01T00:00:00Z',
        version: 1,
    },
    {
        id: 'new-i',
        bikeId: 'b1',
        componentId: 'new-chain',
        position: 'chain',
        startUtc: '2025-01-01T00:00:00Z',
        endUtc: null,
        version: 1,
    },
];
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
function date(value = '2024-06-01T12:00') {
    fireEvent.change(screen.getByLabelText('Date and time'), {
        target: { value },
    });
}
beforeEach(() => {
    vi.resetAllMocks();
    api.listInstallations.mockImplementation((_b, _s, p) =>
        Promise.resolve(
            p.cursor
                ? {
                      items: [
                          {
                              installation: installs[1],
                              component: {
                                  id: 'new-chain',
                                  model: 'New chain',
                                  type: 'chain',
                              },
                          },
                      ],
                      nextCursor: null,
                  }
                : {
                      items: [
                          {
                              installation: installs[0],
                              component: {
                                  id: 'old-chain',
                                  model: 'Old chain',
                                  type: 'chain',
                              },
                          },
                      ],
                      nextCursor: 'next',
                  },
        ),
    );
    api.getComponent.mockImplementation((id) =>
        Promise.resolve({ id, model: id, type: 'chain' }),
    );
    api.getBikeMaintenance.mockResolvedValue([]);
    api.createMaintenance.mockResolvedValue({ id: 'saved' });
    api.getReminder.mockResolvedValue(evaluation);
    api.editReminder.mockResolvedValue(evaluation);
});
it('maintenanceUsesUnpagedBikeArray', async () => {
    api.getBikeMaintenance.mockResolvedValue([
        {
            id: 'old',
            task: 'Old',
            performedUtc: '2024-01-01T00:00:00Z',
            notes: null,
            cost: null,
            currency: null,
        },
        {
            id: 'new',
            task: 'New',
            performedUtc: '2025-01-01T00:00:00Z',
            notes: '<img src=x onerror=alert(1)>',
            cost: 0,
            currency: 'EUR',
        },
        {
            id: 'usd',
            task: 'USD service',
            performedUtc: '2023-01-01T00:00:00Z',
            notes: null,
            cost: 5,
            currency: 'USD',
        },
    ]);
    mount(<Maintenance bikeId="b1" />);
    await screen.findByText('New');
    expect(
        screen
            .getAllByRole('row')
            .slice(1)
            .map((x) => x.textContent),
    ).toEqual([
        expect.stringContaining('New'),
        expect.stringContaining('Old'),
        expect.stringContaining('USD service'),
    ]);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('€0.00')).toBeVisible();
    expect(screen.getByText('Cost not recorded')).toBeVisible();
    expect(screen.getByText('5 USD')).toBeVisible();
    expect(api.getBikeMaintenance).toHaveBeenCalledWith(
        'b1',
        expect.any(AbortSignal),
    );
    expect(screen.queryByText('Load more')).toBeNull();
});
it('backdatedLubricationSelectsChainAtPerformedTime', async () => {
    mount(
        <MaintenanceForm
            bikeId="b1"
            presetTaskKey="chain-lubrication"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    date();
    await screen.findByRole('option', { name: /old-chain/ });
    await waitFor(() =>
        expect(screen.getByText('Save maintenance')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Save maintenance'));
    await waitFor(() => expect(api.createMaintenance).toHaveBeenCalled());
    expect(api.createMaintenance.mock.calls[0][0]).toMatchObject({
        bikeId: 'b1',
        componentId: 'old-chain',
        taskKey: 'chain-lubrication',
        cost: null,
        currency: null,
    });
    expect(api.listInstallations).toHaveBeenCalledWith(
        'b1',
        'all',
        { pageSize: 50, cursor: 'next' },
        expect.any(AbortSignal),
    );
});
it('changingTimeRecalculatesChainAndGenericServiceDoesNotSetTaskKey', async () => {
    mount(
        <MaintenanceForm bikeId="b1" onSaved={() => {}} onCancel={() => {}} />,
    );
    date();
    fireEvent.change(screen.getByLabelText('Task'), {
        target: { value: 'Inspection' },
    });
    await screen.findByRole('option', { name: /old-chain/ });
    fireEvent.change(screen.getByLabelText('Association'), {
        target: { value: 'chain' },
    });
    date('2025-06-01T12:00');
    await screen.findByRole('option', { name: /new-chain/ });
    fireEvent.change(screen.getByLabelText('Cost (EUR)'), {
        target: { value: '0' },
    });
    await waitFor(() =>
        expect(screen.getByText('Save maintenance')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Save maintenance'));
    await waitFor(() => expect(api.createMaintenance).toHaveBeenCalled());
    expect(api.createMaintenance.mock.calls[0][0]).toMatchObject({
        componentId: 'new-chain',
        cost: 0,
        currency: 'EUR',
    });
    expect(api.createMaintenance.mock.calls[0][0].taskKey).toBeUndefined();
});
it('incompleteHistoryDisablesSubmit', async () => {
    api.listInstallations.mockRejectedValue(new Error('History unavailable'));
    mount(
        <MaintenanceForm
            bikeId="b1"
            presetTaskKey="chain-lubrication"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    date();
    await screen.findByText(/Installation history unavailable/);
    expect(screen.getByText('Save maintenance')).toBeDisabled();
    expect(api.createMaintenance).not.toHaveBeenCalled();
});
it('reminderKeepsIndependentIntervalsAndBaseline', async () => {
    const saved = vi.fn();
    mount(
        <ReminderForm
            bikeId="b1"
            evaluation={evaluation}
            onSaved={saved}
            onCancel={() => {}}
        />,
    );
    expect(screen.getByLabelText('Oil interval (km)')).toHaveValue('150');
    expect(screen.getByLabelText('Wax interval (km)')).toHaveValue('300');
    fireEvent.change(screen.getByLabelText('Method'), {
        target: { value: 'wax' },
    });
    fireEvent.change(screen.getByLabelText('Wax interval (km)'), {
        target: { value: '200' },
    });
    fireEvent.click(screen.getByText('Save reminder'));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(api.editReminder).toHaveBeenCalledWith('b1', {
        enabled: true,
        method: 'wax',
        oilThresholdMetres: 150000,
        waxThresholdMetres: 200000,
        expectedVersion: 7,
    });
    expect(api.createMaintenance).not.toHaveBeenCalled();
    expect(evaluation.baselineUtc).toBe('2025-01-01T00:00:00Z');
});
it('disabledAndMissingChainDoNotRenderReady', () => {
    const { rerender } = render(
        <ReminderCard
            evaluation={{
                ...evaluation,
                state: 'disabled',
                enabled: false,
                remainingMetres: null,
                due: null,
            }}
            onConfigure={() => {}}
            onLubricate={() => {}}
        />,
    );
    expect(screen.getByText('Reminder disabled')).toBeVisible();
    expect(screen.queryByText(/Ready/)).toBeNull();
    rerender(
        <ReminderCard
            evaluation={{
                ...evaluation,
                state: 'no-current-chain',
                componentId: null,
                remainingMetres: null,
                due: null,
            }}
            onConfigure={() => {}}
            onLubricate={() => {}}
        />,
    );
    expect(screen.getByText('No fitted chain')).toBeVisible();
    expect(screen.queryByText(/Ready/)).toBeNull();
});
it('readyAndDueRenderOnlyAuthoritativeEvaluation', () => {
    const { rerender } = render(
        <ReminderCard
            evaluation={{
                ...evaluation,
                state: 'ready',
                method: 'wax',
                activeThresholdMetres: 300000,
                remainingMetres: 140000,
                due: false,
            }}
            onConfigure={() => {}}
            onLubricate={() => {}}
        />,
    );
    expect(screen.getByText(/140 km remaining/)).toBeVisible();
    rerender(
        <ReminderCard
            evaluation={{
                ...evaluation,
                state: 'ready',
                method: 'wax',
                activeThresholdMetres: 200000,
                remainingMetres: 40000,
                due: false,
            }}
            onConfigure={() => {}}
            onLubricate={() => {}}
        />,
    );
    expect(screen.getByText(/40 km remaining/)).toBeVisible();
    rerender(
        <ReminderCard
            evaluation={evaluation}
            onConfigure={() => {}}
            onLubricate={() => {}}
        />,
    );
    expect(screen.getByText('Lubrication due')).toBeVisible();
});
it('enabledMissingIntervalsAndDisabledSuppliedInvalidIntervalFail', async () => {
    mount(
        <ReminderForm
            bikeId="b1"
            evaluation={{
                ...evaluation,
                enabled: false,
                method: null,
                oilThresholdMetres: null,
                waxThresholdMetres: null,
            }}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.click(screen.getByLabelText('Enabled'));
    fireEvent.click(screen.getByText('Save reminder'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        /Select a method/,
    );
    expect(api.editReminder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Enabled'));
    fireEvent.change(screen.getByLabelText('Oil interval (km)'), {
        target: { value: '0.999' },
    });
    fireEvent.click(screen.getByText('Save reminder'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        /between 1 and 10000 km/,
    );
    expect(api.editReminder).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Oil interval (km)'), {
        target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('Wax interval (km)'), {
        target: { value: '10000' },
    });
    fireEvent.click(screen.getByText('Save reminder'));
    await waitFor(() =>
        expect(api.editReminder).toHaveBeenCalledWith(
            'b1',
            expect.objectContaining({
                oilThresholdMetres: 1000,
                waxThresholdMetres: 10000000,
            }),
        ),
    );
});
it('staleReminderKeepsAttemptSeparateUntilExplicitFreshVersionReapply', async () => {
    api.editReminder.mockRejectedValueOnce(
        new ApiError(409, 'stale_version', 'Stale'),
    );
    api.getReminder.mockResolvedValue({
        ...evaluation,
        ruleVersion: 8,
        oilThresholdMetres: 180000,
    });
    mount(
        <ReminderForm
            bikeId="b1"
            evaluation={evaluation}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.change(screen.getByLabelText('Wax interval (km)'), {
        target: { value: '200' },
    });
    fireEvent.click(screen.getByText('Save reminder'));
    await screen.findAllByText(/Saved rule version 8/);
    expect(api.editReminder).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Wax interval (km)')).toHaveValue('200');
    fireEvent.click(screen.getByText('Reapply my changes'));
    await waitFor(() => expect(api.editReminder).toHaveBeenCalledTimes(2));
    expect(api.editReminder.mock.calls[1][1]).toMatchObject({
        expectedVersion: 8,
        oilThresholdMetres: 150000,
        waxThresholdMetres: 200000,
    });
});
it('uncertainMaintenanceRequiresHistoryReviewBeforeExplicitResubmit', async () => {
    api.createMaintenance.mockRejectedValueOnce(
        new ApiError(0, 'network_error', 'Lost', undefined, true),
    );
    mount(
        <MaintenanceForm bikeId="b1" onSaved={() => {}} onCancel={() => {}} />,
    );
    date();
    fireEvent.change(screen.getByLabelText('Task'), {
        target: { value: 'Inspect' },
    });
    await screen.findByRole('option', { name: /old-chain/ });
    await waitFor(() =>
        expect(screen.getByText('Save maintenance')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Save maintenance'));
    await screen.findByText(/outcome is uncertain/);
    expect(screen.getByText('Resubmit after review')).toBeDisabled();
    fireEvent.click(screen.getByText('Refresh and check history'));
    await waitFor(() =>
        expect(screen.getByText('Resubmit after review')).toBeEnabled(),
    );
    expect(api.createMaintenance).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Resubmit after review'));
    await waitFor(() => expect(api.createMaintenance).toHaveBeenCalledTimes(2));
});

it('workspaceConnectsMaintenanceAndReminderThroughDirtyGuard', async () => {
    const bike = {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Bike',
        displayName: 'Bike',
        make: null,
        model: null,
        kind: 'road',
        year: null,
        color: null,
        version: 1,
    };
    api.listBikes.mockResolvedValue({ items: [bike], nextCursor: null });
    api.getBike.mockResolvedValue(bike);
    api.getOverview.mockResolvedValue({
        bike,
        rideCount: 0,
        recordedDistanceMetres: 0,
        currentComponents: [],
        allocationGaps: [],
        spendingByCurrency: [],
        unknownCostRecordCount: 0,
        maintenanceRecordCount: 0,
        recentActivity: [],
    });
    window.history.replaceState(
        {},
        '',
        '/?bike=11111111-1111-1111-1111-111111111111&view=overview',
    );
    mount(<Workspace />);
    fireEvent.click(await screen.findByText('Configure reminder'));
    await screen.findByLabelText('Wax interval (km)');
    fireEvent.change(screen.getByLabelText('Wax interval (km)'), {
        target: { value: '200' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log maintenance' }));
    expect(
        await screen.findByRole('dialog', { name: 'Discard unsaved changes?' }),
    ).toBeVisible();
    fireEvent.click(screen.getByText('Keep editing'));
    expect(screen.getByLabelText('Wax interval (km)')).toHaveValue('200');
    fireEvent.click(screen.getByRole('button', { name: 'Log maintenance' }));
    fireEvent.click(screen.getByText('Discard changes'));
    await screen.findByRole('dialog', { name: 'Log maintenance' });
    fireEvent.change(screen.getByLabelText('Task'), {
        target: { value: 'Inspect' },
    });
    date();
    await waitFor(() =>
        expect(screen.getByText('Save maintenance')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Save maintenance'));
    await waitFor(() =>
        expect(
            screen.queryByRole('dialog', { name: 'Log maintenance' }),
        ).toBeNull(),
    );
    fireEvent.click(screen.getByRole('link', { name: /Maintenance/ }));
    expect(
        await screen.findByRole('region', { name: 'Maintenance history' }),
    ).toBeVisible();
});

it('secondHistoryPagePendingKeepsSubmitDisabledUntilComplete', async () => {
    let resolve!: (page: {
        items: (typeof installs)[number][];
        nextCursor: null;
    }) => void;
    api.listInstallations.mockImplementation((_b, _s, p) =>
        p.cursor
            ? new Promise((r) => {
                  resolve = r;
              })
            : Promise.resolve({
                  items: [
                      {
                          installation: installs[0],
                          component: {
                              id: 'old-chain',
                              model: 'Old',
                              type: 'chain',
                          },
                      },
                  ],
                  nextCursor: 'next',
              }),
    );
    mount(
        <MaintenanceForm
            bikeId="b1"
            presetTaskKey="chain-lubrication"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    date();
    await waitFor(() => expect(api.listInstallations).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Save maintenance')).toBeDisabled();
    resolve({ items: [], nextCursor: null });
    await waitFor(() =>
        expect(screen.getByText('Save maintenance')).toBeEnabled(),
    );
});
it('uncertainReminderRequiresFreshReviewAndKeepsExactIntervals', async () => {
    api.editReminder.mockRejectedValueOnce(
        new ApiError(0, 'network_error', 'Lost', undefined, true),
    );
    api.getReminder
        .mockRejectedValueOnce(new Error('Refresh failed'))
        .mockResolvedValue({ ...evaluation, ruleVersion: 8 });
    mount(
        <ReminderForm
            bikeId="b1"
            evaluation={{ ...evaluation, oilThresholdMetres: 150001 }}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    expect(screen.getByLabelText('Oil interval (km)')).toHaveValue('150.001');
    fireEvent.change(screen.getByLabelText('Wax interval (km)'), {
        target: { value: '200' },
    });
    fireEvent.click(screen.getByText('Save reminder'));
    await screen.findByText(/outcome is uncertain/);
    expect(screen.getByText('Resubmit after review')).toBeDisabled();
    fireEvent.click(screen.getByText('Refresh saved reminder'));
    await screen.findByText('Refresh failed');
    expect(screen.getByText('Resubmit after review')).toBeDisabled();
    fireEvent.click(screen.getByText('Refresh saved reminder'));
    await waitFor(() =>
        expect(screen.getByText('Resubmit after review')).toBeEnabled(),
    );
    expect(api.editReminder).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Resubmit after review'));
    await waitFor(() => expect(api.editReminder).toHaveBeenCalledTimes(2));
    expect(api.editReminder.mock.calls[1][1]).toMatchObject({
        expectedVersion: 8,
        oilThresholdMetres: 150001,
        waxThresholdMetres: 200000,
    });
    expect(api.createMaintenance).not.toHaveBeenCalled();
});
it('maintenanceSuccessInvalidatesOverviewHistoryReminderAndComponentPassport', async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const reset = vi.spyOn(client, 'resetQueries');
    render(
        <QueryClientProvider client={client}>
            <MaintenanceForm
                bikeId="b1"
                presetTaskKey="chain-lubrication"
                onSaved={() => {}}
                onCancel={() => {}}
            />
        </QueryClientProvider>,
    );
    date();
    await waitFor(() =>
        expect(screen.getByText('Save maintenance')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Save maintenance'));
    await waitFor(() =>
        expect(reset).toHaveBeenCalledWith({
            queryKey: ['componentMaintenance', 'old-chain'],
        }),
    );
    for (const key of [
        ['overview', 'b1'],
        ['maintenance', 'b1'],
        ['reminder', 'b1'],
        ['component', 'old-chain'],
        ['componentUsage', 'old-chain'],
    ])
        expect(reset).toHaveBeenCalledWith({ queryKey: key });
});
it('enabledIntervalsRequiredAndRepeatedInvalidInputStaysVisible', async () => {
    mount(
        <ReminderForm
            bikeId="b1"
            evaluation={{
                ...evaluation,
                method: 'wax',
                oilThresholdMetres: null,
                waxThresholdMetres: null,
            }}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.click(screen.getByText('Save reminder'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
        'Both oil and wax intervals are required when enabled.',
    );
    screen.getByText('Save reminder').focus();
    fireEvent.click(screen.getByText('Save reminder'));
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(api.editReminder).not.toHaveBeenCalled();
});
it('workspaceReminderWriteLocksNavigationAndCapturesOriginalBike', async () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const bike = {
        id,
        name: 'Bike',
        displayName: 'Bike',
        make: null,
        model: null,
        kind: 'road',
        year: null,
        color: null,
        version: 1,
    };
    api.listBikes.mockResolvedValue({ items: [bike], nextCursor: null });
    api.getBike.mockResolvedValue(bike);
    api.getOverview.mockResolvedValue({
        bike,
        rideCount: 0,
        recordedDistanceMetres: 0,
        currentComponents: [],
        allocationGaps: [],
        spendingByCurrency: [],
        unknownCostRecordCount: 0,
        maintenanceRecordCount: 0,
        recentActivity: [],
    });
    let resolve!: (e: typeof evaluation) => void;
    api.editReminder.mockImplementation(
        () =>
            new Promise((r) => {
                resolve = r;
            }),
    );
    window.history.replaceState({}, '', `/?bike=${id}&view=overview`);
    mount(<Workspace />);
    fireEvent.click(await screen.findByText('Configure reminder'));
    fireEvent.change(screen.getByLabelText('Wax interval (km)'), {
        target: { value: '200' },
    });
    fireEvent.click(screen.getByText('Save reminder'));
    await waitFor(() => expect(api.editReminder).toHaveBeenCalled());
    expect(api.editReminder.mock.calls[0][0]).toBe(id);
    expect(
        screen.getByRole('button', { name: 'Log maintenance' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('link', { name: /Maintenance/ }));
    expect(window.location.search).toContain('view=overview');
    expect(
        screen.getByRole('dialog', { name: 'Configure lubrication reminder' }),
    ).toBeVisible();
    resolve({ ...evaluation, waxThresholdMetres: 200000 });
    await waitFor(() =>
        expect(
            screen.queryByRole('dialog', {
                name: 'Configure lubrication reminder',
            }),
        ).toBeNull(),
    );
});
it('maintenance chooses old chapter before a microsecond replacement boundary and retries precisely', async () => {
    const { formatLocal } = await import('../src/lib/dates');
    const boundary = '2026-09-03T07:00:00.000500Z';
    const history = [
        { ...installs[0], endUtc: boundary },
        { ...installs[1], startUtc: boundary },
    ];
    api.listInstallations.mockResolvedValue({
        items: history.map((installation) => ({
            installation,
            component: {
                id: installation.componentId,
                model: installation.componentId,
                type: 'chain',
            },
        })),
        nextCursor: null,
    });
    api.createMaintenance
        .mockRejectedValueOnce(
            new ApiError(0, 'network', 'Lost response', undefined, true),
        )
        .mockResolvedValue({ id: 'saved' });
    mount(
        <MaintenanceForm
            bikeId="b1"
            presetTaskKey="chain-lubrication"
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    date(formatLocal('2026-09-03T07:00:00Z'));
    await screen.findByText('At the entered time: old-chain');
    await waitFor(() =>
        expect(screen.getByText('Save maintenance')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Save maintenance'));
    await screen.findByText(/The save outcome is uncertain/);
    fireEvent.click(screen.getByText('Refresh and check history'));
    await waitFor(() =>
        expect(screen.getByText('Resubmit after review')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Resubmit after review'));
    await waitFor(() => expect(api.createMaintenance).toHaveBeenCalledTimes(2));
    expect(api.createMaintenance.mock.calls[1][0].componentId).toBe(
        'old-chain',
    );
});
it('maintenance task and cost errors identify their controls', async () => {
    mount(
        <MaintenanceForm bikeId="b1" onSaved={() => {}} onCancel={() => {}} />,
    );
    date();
    await waitFor(() =>
        expect(screen.getByText('Save maintenance')).toBeEnabled(),
    );
    fireEvent.click(screen.getByText('Save maintenance'));
    expect(screen.getByLabelText('Task')).toHaveAttribute(
        'aria-invalid',
        'true',
    );
    fireEvent.change(screen.getByLabelText('Task'), {
        target: { value: 'Inspect' },
    });
    fireEvent.change(screen.getByLabelText('Cost (EUR)'), {
        target: { value: '1.001' },
    });
    fireEvent.click(screen.getByText('Save maintenance'));
    expect(screen.getByLabelText('Cost (EUR)')).toHaveAttribute(
        'aria-invalid',
        'true',
    );
});
it('reminder threshold errors identify oil then wax', () => {
    mount(
        <ReminderForm
            bikeId="b1"
            evaluation={evaluation}
            onSaved={() => {}}
            onCancel={() => {}}
        />,
    );
    fireEvent.change(screen.getByLabelText('Oil interval (km)'), {
        target: { value: '0' },
    });
    fireEvent.click(screen.getByText('Save reminder'));
    expect(screen.getByLabelText('Oil interval (km)')).toHaveAttribute(
        'aria-invalid',
        'true',
    );
    fireEvent.change(screen.getByLabelText('Oil interval (km)'), {
        target: { value: '150' },
    });
    fireEvent.change(screen.getByLabelText('Wax interval (km)'), {
        target: { value: '10001' },
    });
    fireEvent.click(screen.getByText('Save reminder'));
    expect(screen.getByLabelText('Wax interval (km)')).toHaveAttribute(
        'aria-invalid',
        'true',
    );
});
