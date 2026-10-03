import { Temporal } from '@js-temporal/polyfill';
import { InputError } from './units';
// Resolve once in the browser/runtime; every default helper uses the same IANA zone.
export const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
function wall(value: string): Temporal.PlainDateTime {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(value))
        throw new InputError('Enter a local date and time.');
    try {
        return Temporal.PlainDateTime.from(value, { overflow: 'reject' });
    } catch {
        throw new InputError('Enter a valid local date and time.');
    }
}
function candidates(value: string, timeZone: string): Temporal.ZonedDateTime[] {
    const local = wall(value);
    const earlier = local.toZonedDateTime(timeZone, {
        disambiguation: 'earlier',
    });
    const later = local.toZonedDateTime(timeZone, {
        disambiguation: 'later',
    });
    return [earlier, later].filter(
        (candidate, index, all) =>
            candidate.toPlainDateTime().equals(local) &&
            all.findIndex(
                (other) =>
                    other.epochNanoseconds === candidate.epochNanoseconds,
            ) === index,
    );
}
/** Empty means a DST gap; two entries require an explicit user offset choice. */
export function validOffsets(
    value: string,
    timeZone = LOCAL_TIME_ZONE,
): string[] {
    return candidates(value, timeZone).map((candidate) => candidate.offset);
}
export function toUtc(
    value: string,
    offsetChoice?: string,
    timeZone = LOCAL_TIME_ZONE,
): string {
    const possible = candidates(value, timeZone);
    if (possible.length === 0)
        throw new InputError(
            'This local time does not exist because the clocks move forward.',
        );
    if (possible.length > 1 && !offsetChoice)
        throw new InputError(
            'Choose an offset because this local time occurs twice.',
        );
    const chosen = offsetChoice
        ? possible.find((candidate) => candidate.offset === offsetChoice)
        : possible[0];
    if (!chosen)
        throw new InputError('Choose a valid offset for this local time.');
    return chosen.toInstant().toString();
}
/** Minute-resolution value for datetime-local inputs, never a stored replacement. */
export function formatLocal(iso: string, timeZone = LOCAL_TIME_ZONE): string {
    return Temporal.Instant.from(iso)
        .toZonedDateTimeISO(timeZone)
        .toPlainDateTime()
        .toString({ smallestUnit: 'minute' });
}
export function preserveOrConvertInstant(
    originalUtc: string | undefined,
    originalWall: string | undefined,
    newWall: string,
    offsetChoice?: string,
    timeZone = LOCAL_TIME_ZONE,
): string {
    if (
        originalUtc !== undefined &&
        originalWall !== undefined &&
        originalWall === newWall &&
        (offsetChoice === undefined ||
            Temporal.Instant.from(originalUtc).toZonedDateTimeISO(timeZone)
                .offset === offsetChoice)
    )
        return originalUtc;
    return toUtc(newWall, offsetChoice, timeZone);
}

/** Display is en-GB; input formatting remains independent and minute-resolved. */
export function formatDateTime(
    iso: string,
    timeZone = LOCAL_TIME_ZONE,
): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(new Date(iso));
}

/** Installation chapters include their start and exclude their end, at full wire precision. */
export function withinInstallation(
    instant: string,
    start: string,
    end: string | null,
): boolean {
    return (
        Temporal.Instant.compare(start, instant) <= 0 &&
        (end === null || Temporal.Instant.compare(instant, end) < 0)
    );
}
