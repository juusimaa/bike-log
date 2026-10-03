const origin = 'http://127.0.0.1:3000';
const upstream = 'http://127.0.0.1:5080';
const uuid = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}';
const routes: [RegExp, string[]][] = [
    [/^(bikes|components)$/, ['GET', 'POST']],
    [/^rides$/, ['POST']],
    [/^(installations|maintenance)$/, ['POST']],
    [new RegExp(`^bikes/${uuid}$`, 'i'), ['GET', 'PUT']],
    [
        new RegExp(
            `^bikes/${uuid}/(overview|rides|installations|maintenance)$`,
            'i',
        ),
        ['GET'],
    ],
    [new RegExp(`^bikes/${uuid}/reminder$`, 'i'), ['GET', 'PUT']],
    [new RegExp(`^components/${uuid}$`, 'i'), ['GET']],
    [new RegExp(`^components/${uuid}/(usage|maintenance)$`, 'i'), ['GET']],
    [new RegExp(`^components/${uuid}/estimate$`, 'i'), ['PUT']],
    [
        new RegExp(`^installations/${uuid}/replacement-with-service$`, 'i'),
        ['POST'],
    ],
    [new RegExp(`^rides/${uuid}$`, 'i'), ['GET', 'PUT', 'DELETE']],
];
function problem(status: number, code: string): Response {
    return Response.json(
        {
            status,
            code,
            title:
                code === 'backend_unavailable'
                    ? 'The backend is unavailable.'
                    : 'Request rejected.',
        },
        { status, headers: { 'cache-control': 'no-store' } },
    );
}
export async function forwardApi(
    request: Request,
    path: string[],
): Promise<Response> {
    const route = routes.find(([pattern]) => pattern.test(path.join('/')));
    if (!route || path.some((segment) => !/^[a-z0-9-]+$/i.test(segment)))
        return problem(404, 'not_found');
    if (!route[1].includes(request.method))
        return problem(405, 'method_not_allowed');
    const mutation = request.method !== 'GET';
    if (
        (request.headers.get('host') ?? new URL(request.url).host) !==
            '127.0.0.1:3000' ||
        (request.headers.has('origin') &&
            request.headers.get('origin') !== origin) ||
        (mutation && request.headers.get('origin') !== origin)
    )
        return problem(403, 'foreign_origin');
    const hasBody = mutation && request.method !== 'DELETE';
    if (
        hasBody &&
        !/^application\/json(?:;|$)/i.test(
            request.headers.get('content-type') ?? '',
        )
    )
        return problem(415, 'json_required');
    try {
        const headers = new Headers({ accept: 'application/json' });
        if (hasBody) headers.set('content-type', 'application/json');
        const target = new URL(`/api/${path.join('/')}`, upstream);
        target.search = new URL(request.url).search;
        const response = await fetch(target, {
            method: request.method,
            headers,
            body: hasBody ? await request.text() : undefined,
            redirect: 'manual',
            cache: 'no-store',
            signal: request.signal,
        });
        if (response.status >= 300 && response.status < 400)
            return problem(502, 'backend_unavailable');
        const responseHeaders = new Headers({ 'cache-control': 'no-store' });
        if ([204, 205, 304].includes(response.status))
            return new Response(null, {
                status: response.status,
                headers: responseHeaders,
            });
        const contentType = response.headers.get('content-type') ?? '';
        if (!/^application\/(?:json|problem\+json)(?:;|$)/i.test(contentType))
            return problem(502, 'backend_unavailable');
        responseHeaders.set('content-type', contentType);
        return new Response(await response.text(), {
            status: response.status,
            headers: responseHeaders,
        });
    } catch {
        return problem(502, 'backend_unavailable');
    }
}
