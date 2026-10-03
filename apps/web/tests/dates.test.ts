import { expect, it, vi } from 'vitest';
import {
    toUtc as convert,
    formatLocal as format,
    validOffsets as offsets,
    preserveOrConvertInstant as preserve,
} from '../src/lib/dates';
// Helsinki is a fixture, never an assumption about the browser runtime zone.
const toUtc = (value: string, offsetChoice?: string) =>
    convert(value, offsetChoice, 'Europe/Helsinki');
const formatLocal = (iso: string) => format(iso, 'Europe/Helsinki');
const validOffsets = (value: string) => offsets(value, 'Europe/Helsinki');
const preserveOrConvertInstant = (
    originalUtc: string | undefined,
    originalWall: string | undefined,
    newWall: string,
    offsetChoice?: string,
) =>
    preserve(
        originalUtc,
        originalWall,
        newWall,
        offsetChoice,
        'Europe/Helsinki',
    );

it('utcConversionResolvesDstExplicitly', () => {
    expect(() => toUtc('2026-03-29T03:30')).toThrow();
    expect(validOffsets('2026-03-29T03:30')).toEqual([]);
    expect(() => toUtc('2026-10-25T03:30')).toThrow();
    expect(validOffsets('2026-10-25T03:30')).toEqual(['+03:00', '+02:00']);
    expect(toUtc('2026-10-25T03:30', '+03:00')).toBe('2026-10-25T00:30:00Z');
    expect(toUtc('2026-10-25T03:30', '+02:00')).toBe('2026-10-25T01:30:00Z');
    expect(() => toUtc('2026-10-25T03:30', '+04:00')).toThrow();
});
it('untouchedInstantPreservesMicroseconds', () => {
    const original = '2026-02-20T08:30:12.123456Z';
    expect(formatLocal(original)).toBe('2026-02-20T10:30');
    expect(
        preserveOrConvertInstant(
            original,
            '2026-02-20T10:30',
            '2026-02-20T10:30',
        ),
    ).toBe(original);
    expect(
        preserveOrConvertInstant(
            original,
            '2026-02-20T10:30',
            '2026-02-20T10:31',
        ),
    ).toBe('2026-02-20T08:31:00Z');
});
it('rejects malformed walls without calendar normalization', () => {
    for (const value of [
        '2026-02-30T10:00',
        '2026-02-20',
        '2026-02-20T10:00Z',
        '2026-02-20T24:00',
    ])
        expect(() => toUtc(value)).toThrow();
    expect(toUtc('2026-06-01T12:00')).toBe('2026-06-01T09:00:00Z');
});
it('explicit offset edit changes an otherwise identical overlap wall', () => {
    expect(
        preserveOrConvertInstant(
            '2026-10-25T00:30:12.123456Z',
            '2026-10-25T03:30',
            '2026-10-25T03:30',
            '+02:00',
        ),
    ).toBe('2026-10-25T01:30:00Z');
    expect(
        preserveOrConvertInstant(
            '2026-10-25T00:30:12.123456Z',
            '2026-10-25T03:30',
            '2026-10-25T03:30',
            '+03:00',
        ),
    ).toBe('2026-10-25T00:30:12.123456Z');
});

it('defaults every date operation to the non-Helsinki browser runtime zone', async () => {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    const runtimeZone = vi
        .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
        .mockReturnValue({ ...resolved, timeZone: 'America/New_York' });
    vi.resetModules();
    try {
        const local = await import('../src/lib/dates');
        const original = '2026-02-20T08:30:12.123456Z';
        expect(local.formatLocal(original)).toBe('2026-02-20T03:30');
        expect(local.toUtc('2026-02-20T03:31')).toBe('2026-02-20T08:31:00Z');
        expect(local.validOffsets('2026-11-01T01:30')).toEqual([
            '-04:00',
            '-05:00',
        ]);
        expect(() => local.toUtc('2026-03-08T02:30')).toThrow();
        expect(
            local.preserveOrConvertInstant(
                original,
                '2026-02-20T03:30',
                '2026-02-20T03:30',
            ),
        ).toBe(original);
        expect(
            local.preserveOrConvertInstant(
                original,
                '2026-02-20T03:30',
                '2026-02-20T03:31',
            ),
        ).toBe('2026-02-20T08:31:00Z');
        expect(
            local.preserveOrConvertInstant(
                '2026-11-01T05:30:12.123456Z',
                '2026-11-01T01:30',
                '2026-11-01T01:30',
                '-04:00',
            ),
        ).toBe('2026-11-01T05:30:12.123456Z');
        expect(
            local.preserveOrConvertInstant(
                '2026-11-01T05:30:12.123456Z',
                '2026-11-01T01:30',
                '2026-11-01T01:30',
                '-05:00',
            ),
        ).toBe('2026-11-01T06:30:00Z');
    } finally {
        runtimeZone.mockRestore();
        vi.resetModules();
    }
});
it('supports deterministic zone injection independently of the host zone', () => {
    expect(format('2026-06-01T09:00:00Z', 'America/New_York')).toBe(
        '2026-06-01T05:00',
    );
    expect(convert('2026-06-01T05:00', undefined, 'America/New_York')).toBe(
        '2026-06-01T09:00:00Z',
    );
});
it('display uses en-GB independently of runtime locale and input format', async () => {
    const { formatDateTime } = await import('../src/lib/dates');
    expect(
        formatDateTime('2026-02-20T08:31:12.123456Z', 'Europe/Helsinki'),
    ).toBe('20/02/2026, 10:31');
    expect(
        formatDateTime('2026-02-20T08:31:12.123456Z', 'America/New_York'),
    ).toBe('20/02/2026, 03:31');
});
it('installation boundaries compare precise instants with half-open equality', async () => {
    const { withinInstallation } = await import('../src/lib/dates');
    const boundary = '2026-09-03T07:00:00.000500Z';
    expect(
        withinInstallation(
            '2026-09-03T07:00:00Z',
            '2026-01-01T00:00:00Z',
            boundary,
        ),
    ).toBe(true);
    expect(withinInstallation(boundary, '2026-01-01T00:00:00Z', boundary)).toBe(
        false,
    );
    expect(withinInstallation(boundary, boundary, null)).toBe(true);
    expect(
        withinInstallation('2026-09-03T07:00:00.000499Z', boundary, null),
    ).toBe(false);
});
