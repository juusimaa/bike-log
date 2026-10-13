// Synthetic copy of GET /api/component-catalog for tests. The app never hard-codes this list.
const rows: [string, string, string, string | null, string, string | null][] = [
    ['fork', 'fork', 'build', null, 'Fork', null],
    ['bottom-bracket', 'bottom-bracket', 'build', null, 'Bottom bracket', null],
    ['handlebar', 'handlebar', 'build', null, 'Handlebar', null],
    ['handlebar-tape', 'handlebar-tape', 'build', null, 'Handlebar tape', null],
    ['saddle', 'saddle', 'build', null, 'Saddle', null],
    ['seatpost', 'seatpost', 'build', null, 'Seatpost', null],
    ['pedals', 'pedals', 'build', null, 'Pedals', null],
    [
        'front-through-axle',
        'through-axle',
        'build',
        'front',
        'Front through-axle',
        null,
    ],
    [
        'rear-through-axle',
        'through-axle',
        'build',
        'rear',
        'Rear through-axle',
        null,
    ],
    [
        'front-derailleur',
        'front-derailleur',
        'groupset',
        null,
        'Front derailleur',
        'none-fitted',
    ],
    [
        'rear-derailleur',
        'rear-derailleur',
        'groupset',
        null,
        'Rear derailleur',
        null,
    ],
    ['shifters', 'shifters', 'groupset', null, 'Shifters', null],
    ['cassette', 'cassette', 'groupset', null, 'Cassette', null],
    ['chain', 'chain', 'groupset', null, 'Chain', null],
    ['front-brake', 'brake', 'groupset', 'front', 'Front brake', null],
    ['rear-brake', 'brake', 'groupset', 'rear', 'Rear brake', null],
    [
        'front-brake-lever',
        'brake-lever',
        'groupset',
        'front',
        'Front brake lever',
        null,
    ],
    [
        'rear-brake-lever',
        'brake-lever',
        'groupset',
        'rear',
        'Rear brake lever',
        null,
    ],
    ['crankset', 'crankset', 'groupset', null, 'Crankset', null],
    ['front-rim', 'rim', 'wheels', 'front', 'Front rim', null],
    ['rear-rim', 'rim', 'wheels', 'rear', 'Rear rim', null],
    ['front-tyre', 'tyre', 'wheels', 'front', 'Front tyre', null],
    ['rear-tyre', 'tyre', 'wheels', 'rear', 'Rear tyre', null],
    [
        'front-disc-rotor',
        'disc-rotor',
        'wheels',
        'front',
        'Front disc rotor',
        null,
    ],
    [
        'rear-disc-rotor',
        'disc-rotor',
        'wheels',
        'rear',
        'Rear disc rotor',
        null,
    ],
    [
        'front-inner-tube',
        'inner-tube',
        'wheels',
        'front',
        'Front inner tube',
        'tubeless',
    ],
    [
        'rear-inner-tube',
        'inner-tube',
        'wheels',
        'rear',
        'Rear inner tube',
        'tubeless',
    ],
];
export const catalog = {
    groups: ['build', 'groupset', 'wheels'],
    positions: rows.map(([position, type, group, end, label, exemption]) => ({
        position,
        type,
        group,
        end: end as 'front' | 'rear' | null,
        label,
        exemption: exemption as 'none-fitted' | 'tubeless' | null,
    })),
    pairTypes: [
        'through-axle',
        'brake',
        'brake-lever',
        'rim',
        'tyre',
        'disc-rotor',
        'inner-tube',
    ],
};
type State = 'fitted' | 'exempt' | 'missing' | 'not-recorded';
export function status(
    position: string,
    state: State = 'not-recorded',
    extra: Partial<{
        componentId: string;
        installationId: string;
        exemptionId: string;
        reason: 'none-fitted' | 'tubeless';
        sinceUtc: string;
    }> = {},
) {
    return {
        position,
        state,
        componentId: null,
        installationId: null,
        exemptionId: null,
        reason: null,
        sinceUtc: null,
        ...extra,
    };
}
/** The fields the overview gained in feature 002, for an empty bike. */
export function overviewExtras(
    overrides: Partial<Record<string, ReturnType<typeof status>>> = {},
) {
    return {
        positionStatuses: catalog.positions.map(
            (p) => overrides[p.position] ?? status(p.position),
        ),
        positionGaps: [] as {
            position: string;
            rideCount: number;
            firstRideStartUtc: string;
            lastRideStartUtc: string;
        }[],
        weights: {
            groups: catalog.groups.map((group) => ({
                group,
                grams: 0,
                missingCount: 0,
            })),
            frameGrams: null as number | null,
            totalGrams: 0,
            missingCount: 1,
        },
    };
}
