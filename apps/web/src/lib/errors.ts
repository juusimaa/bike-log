import { ApiError } from '@bikelog/api-client';
const offline = () =>
    typeof navigator !== 'undefined' && navigator.onLine === false;
const unreachable =
    'Bike Log could not reach the server. Check your connection, then try again.';
const offlineText = 'You appear to be offline. Reconnect, then try again.';
/** "newMake must…" → "Make must…": API messages name request fields in camelCase. */
function humanizeField(text: string): string {
    return text.replace(
        /^([a-z][A-Za-z]*)(?= (?:must|is|cannot|exceeds)\b)/,
        (field) => {
            const words = field
                .replace(/^new(?=[A-Z])/, '')
                .replace(/Utc$/, 'Time')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .toLowerCase();
            return words[0].toUpperCase() + words.slice(1);
        },
    );
}
/**
 * User-facing text for a failed read or write. The API puts its code in the problem
 * title and the sentence in detail; a bare code is never shown.
 */
export function errorText(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 0 && error.code === 'backend_unavailable')
            return offline() ? offlineText : unreachable;
        if (error.status === 429)
            return 'Too many requests in a short time. Wait a moment, then try again.';
        const detail = error.problem?.detail;
        const text =
            typeof detail === 'string' && detail.trim()
                ? detail
                : error.message;
        if (!text || /^[a-z]+(?:_[a-z]+)+$/.test(text))
            return error.status >= 500
                ? 'Bike Log hit a problem on the server. Try again in a moment.'
                : 'The request could not be completed.';
        return humanizeField(text);
    }
    if (error instanceof Error) return humanizeField(error.message);
    return 'Something went wrong. Try again.';
}
/** Heading and explanation for a read that failed, so the panel names the problem. */
export function readErrorCopy(error: unknown): { title: string; body: string } {
    const body = errorText(error);
    if (
        (error instanceof Error && error.name === 'ClientRangeError') ||
        (error instanceof ApiError && error.code === 'client_range')
    )
        return { title: 'Value out of supported range', body };
    if (!(error instanceof ApiError))
        return { title: 'Data unavailable', body };
    if (error.status === 0 && error.code === 'backend_unavailable')
        return {
            title: offline() ? 'You are offline' : 'Can’t reach Bike Log',
            body,
        };
    if (error.status === 404)
        return {
            title: 'Not found',
            body: 'This record is no longer available. It may have been removed.',
        };
    if (error.status === 429) return { title: 'Slow down a moment', body };
    return { title: 'Data unavailable', body };
}
