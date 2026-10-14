import { localUpstream } from '@/lib/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public and data-free: platform probes and the deploy check call it. Probes
// send the replica's IP as Host, so unlike the proxy it does not check Host.
function reply(status: number, body: string): Response {
    return new Response(body, {
        status,
        headers: {
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=utf-8',
        },
    });
}

export async function GET(): Promise<Response> {
    try {
        const response = await fetch(`${localUpstream}/health/ready`, {
            cache: 'no-store',
            redirect: 'manual',
            signal: AbortSignal.timeout(3000),
        });
        return response.status === 200
            ? reply(200, 'ok')
            : reply(503, 'unavailable');
    } catch {
        return reply(503, 'unavailable');
    }
}

function notAllowed(): Response {
    return new Response(null, {
        status: 405,
        headers: { allow: 'GET', 'cache-control': 'no-store' },
    });
}
export {
    notAllowed as POST,
    notAllowed as PUT,
    notAllowed as DELETE,
    notAllowed as PATCH,
};
