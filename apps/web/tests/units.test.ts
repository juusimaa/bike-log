import { describe, expect, it } from 'vitest';
import { parseKilometres, parseMinutes, parseEuroCost } from '../src/lib/units';
import {
    formatKilometres,
    formatMinutes,
    formatEuroCost,
} from '../src/lib/format';
describe('exact input units', () => {
    it('unitsDoNotRound', () => {
        expect(parseKilometres('65.001', false)).toBe(65001);
        expect(parseMinutes('1.5')).toBe(90);
        expect(parseEuroCost('12.34')).toBe(12.34);
        expect(parseKilometres('9007199254740.991', false)).toBe(
            Number.MAX_SAFE_INTEGER,
        );
    });
    it('nullAndZeroAreDifferent', () => {
        expect(parseMinutes('')).toBeNull();
        expect(parseEuroCost('  ')).toBeNull();
        expect(parseEuroCost('0')).toBe(0);
        expect(() => parseMinutes('0')).toThrow('greater than zero');
        expect(parseKilometres('0', true)).toBe(0);
        expect(() => parseKilometres('0', false)).toThrow();
    });
    it.each([
        '0.0001',
        '-1',
        '1e3',
        'Infinity',
        '9007199254740.992',
        '',
        '1,2',
    ])('rejects unsupported kilometres %s', (value) => {
        expect(() => parseKilometres(value, false)).toThrow();
    });
    it('rejects fractional seconds and cents instead of rounding', () => {
        expect(() => parseMinutes('0.001')).toThrow();
        expect(() => parseEuroCost('1.001')).toThrow();
        expect(() => parseEuroCost('90071992547409.92')).toThrow();
        expect(() => parseMinutes('9007199254740991')).toThrow();
        expect(() => parseEuroCost('-1')).toThrow();
    });
    it('formats exact units and preserves unknown values', () => {
        expect(formatKilometres(65001)).toBe('65.001');
        expect(formatMinutes(90)).toBe('1.5');
        expect(formatMinutes(null)).toBe('Unknown');
        expect(formatEuroCost(0)).toBe('€0.00');
        expect(formatEuroCost(null)).toBe('Unknown');
        expect(() => formatKilometres(Number.MAX_SAFE_INTEGER + 1)).toThrow();
    });
});

it('rejects excess decimal places even when the extra digits are zero', () => {
    expect(() => parseKilometres('1.0000', false)).toThrow();
    expect(() => parseEuroCost('1.000')).toThrow();
    expect(parseKilometres('1.000', false)).toBe(1000);
    expect(parseEuroCost('1.00')).toBe(1);
});
it('prose durations always have units and null is not recorded', async () => {
    const { formatDuration } = await import('../src/lib/format');
    expect(formatDuration(90)).toBe('1.5 min');
    expect(formatDuration(61)).toBe('1 min 1 sec');
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(null)).toBe('Not recorded');
});
