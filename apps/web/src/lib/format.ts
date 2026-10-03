import { InputError, parseEuroCost } from './units';
function integer(value: number): bigint {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new InputError('Unsupported numeric value.');
    return BigInt(value);
}
export function formatKilometres(metres: number): string {
    const value = integer(metres);
    const fraction = String(value % 1000n)
        .padStart(3, '0')
        .replace(/0+$/, '');
    return `${value / 1000n}${fraction ? `.${fraction}` : ''}`;
}
/** Presentation only. Non-terminating minute fractions use minutes + seconds. */
export function formatMinutes(seconds: number | null): string {
    if (seconds === null) return 'Unknown';
    const value = integer(seconds);
    if (value % 3n !== 0n) return `${value / 60n} min ${value % 60n} sec`;
    const hundredths = (value * 100n) / 60n;
    const fraction = String(hundredths % 100n)
        .padStart(2, '0')
        .replace(/0+$/, '');
    return `${hundredths / 100n}${fraction ? `.${fraction}` : ''}`;
}
export function formatEuroCost(cost: number | null): string {
    if (cost === null) return 'Unknown';
    parseEuroCost(String(cost));
    return `€${cost.toFixed(2)}`;
}

/** Prose/table duration, with explicit units and the recorded/null distinction. */
export function formatDuration(seconds: number | null): string {
    if (seconds === null) return 'Not recorded';
    const text = formatMinutes(seconds);
    return text.includes(' min ') ? text : `${text} min`;
}
