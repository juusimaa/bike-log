/** Input conversions only: domain calculations belong to the API. */
export class InputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InputError';
    }
}
const limit = BigInt(Number.MAX_SAFE_INTEGER);
function scaled(
    value: string,
    multiplier: bigint,
    maxDecimalPlaces?: number,
): bigint {
    const text = value.trim();
    const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match)
        throw new InputError('Enter a non-negative decimal using a dot.');
    const fraction = match[2] ?? '';
    if (maxDecimalPlaces !== undefined && fraction.length > maxDecimalPlaces)
        throw new InputError(`Use at most ${maxDecimalPlaces} decimal places.`);
    // Bound input length before allocating large integers.
    if (text.length > 100) throw new InputError('This value is too large.');
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = BigInt(match[1] + fraction) * multiplier;
    if (numerator % denominator !== 0n)
        throw new InputError('This value has unsupported precision.');
    const result = numerator / denominator;
    if (result > limit)
        throw new InputError('This value exceeds the supported range.');
    return result;
}
export function parseKilometres(value: string, allowZero: boolean): number {
    const metres = scaled(value, 1000n, 3);
    if (!allowZero && metres === 0n)
        throw new InputError('Distance must be greater than zero.');
    return Number(metres);
}
export function parseMinutes(value: string): number | null {
    if (value.trim() === '') return null;
    const seconds = scaled(value, 60n);
    if (seconds === 0n)
        throw new InputError('Duration must be greater than zero.');
    return Number(seconds);
}
export function parseEuroCost(value: string): number | null {
    if (value.trim() === '') return null;
    const cents = scaled(value, 100n, 2);
    const result = Number(cents) / 100;
    // JS number must serialize to exactly the same cents, even at large magnitudes.
    if (scaled(String(result), 100n) !== cents)
        throw new InputError('This cost cannot be represented safely.');
    return result;
}
