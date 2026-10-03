import { parse } from 'lossless-json';

export class ClientRangeError extends Error {
    constructor() {
        super('This value exceeds the supported client numeric range.');
        this.name = 'ClientRangeError';
    }
}
/** Parse decimal text with exact integer arithmetic before converting to JS. */
export function safeNumericToken(token: string, integerOnly = false): number {
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
    if (!match) throw new ClientRangeError();
    const exponent = Number(match[4] ?? 0);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 400)
        throw new ClientRangeError();
    let coefficient = BigInt(match[2] + (match[3] ?? ''));
    let scale = (match[3]?.length ?? 0) - exponent;
    while (scale > 0 && coefficient % 10n === 0n) {
        coefficient /= 10n;
        scale--;
    }
    if (scale > (integerOnly ? 0 : 2)) throw new ClientRangeError();
    const units =
        coefficient * 10n ** BigInt(Math.max(0, (integerOnly ? 0 : 2) - scale));
    if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw new ClientRangeError();
    const value = Number(token);
    if (
        !Number.isFinite(value) ||
        (integerOnly && !Number.isSafeInteger(value))
    )
        throw new ClientRangeError();
    // Compare canonical decimal representations, so even safe-cent magnitudes
    // that round during number conversion (e.g. 90071992547409.91) are rejected.
    if (!integerOnly) {
        const roundTrip = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(
            String(value),
        );
        if (!roundTrip) throw new ClientRangeError();
        const converted = BigInt(roundTrip[2] + (roundTrip[3] ?? ''));
        const convertedScale =
            (roundTrip[3]?.length ?? 0) - Number(roundTrip[4] ?? 0);
        const convertedCents =
            converted * 10n ** BigInt(Math.max(0, 2 - convertedScale));
        if (convertedScale > 2 || convertedCents !== units)
            throw new ClientRangeError();
    }
    return value;
}
export function decodeJson(text: string): unknown {
    return parse(text, null, (token) => {
        // Integral tokens use the integer range; fractional tokens use exact cents.
        const value = safeNumericToken(token, !/[.eE]/.test(token));
        return value;
    });
}
