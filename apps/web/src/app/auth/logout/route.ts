import { clearSessionCookie, sessionIdFromCookie } from '@/lib/auth/cookies';
import { getSessionStore, readAuthConfig } from '@/lib/auth/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
    const origin = process.env.WEB_PUBLIC_ORIGIN;
    const suppliedOrigin = request.headers.get('origin');
    const sameSite = request.headers.get('sec-fetch-site') === 'same-origin';
    if (!origin || request.headers.get('host') !== new URL(origin).host || (suppliedOrigin ? suppliedOrigin !== origin : !sameSite)) {
        return Response.json({ code: 'foreign_origin' }, { status: 403, headers: { 'cache-control': 'no-store' } });
    }
    let logoutUrl: URL;
    try {
        const config = readAuthConfig();
        logoutUrl = new URL('v2/logout', config.issuer);
        logoutUrl.searchParams.set('client_id', config.clientId);
        logoutUrl.searchParams.set('returnTo', `${origin}/?signedOut=1`);
    } catch {
        return Response.json({ code: 'sign_out_unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    const id = sessionIdFromCookie(request.headers.get('cookie'));
    try {
        if (id) await getSessionStore().delete(id);
    } catch {
        return Response.json({ code: 'sign_out_unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    return Response.json({ logoutUrl: logoutUrl.href }, { headers: { 'set-cookie': clearSessionCookie(), 'cache-control': 'no-store' } });
}
