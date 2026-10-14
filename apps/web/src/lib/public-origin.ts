export class ForeignOriginError extends Error {
    constructor() {
        super('The request does not belong to the configured public origin.');
        this.name = 'ForeignOriginError';
    }
}

/**
 * The request's public origin, taken from configuration rather than the
 * request. Behind TLS-terminating ingress request.url carries http:, so only
 * its host is trusted, and only when it equals the configured host.
 * X-Forwarded-Host is never read; X-Forwarded-Proto, when present, must be
 * https for an https origin.
 */
export function publicRequestOrigin(
    request: Request,
    configured: string | undefined = process.env.WEB_PUBLIC_ORIGIN,
): string {
    if (!configured || new URL(configured).origin !== configured)
        throw new Error('An exact WEB_PUBLIC_ORIGIN is required.');
    const origin = new URL(configured);
    const host = request.headers.get('host') ?? new URL(request.url).host;
    if (host !== origin.host) throw new ForeignOriginError();
    const proto = request.headers.get('x-forwarded-proto');
    if (origin.protocol === 'https:' && proto !== null && proto !== 'https')
        throw new ForeignOriginError();
    return configured;
}
