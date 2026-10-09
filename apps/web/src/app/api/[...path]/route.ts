import { authenticatedWebMode, forwardApi } from '@/lib/proxy';
import { getApiAccessToken } from '@/lib/auth/access-token';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
    try {
        const token = authenticatedWebMode()
            ? await getApiAccessToken(request)
            : undefined;
        return forwardApi(request, (await context.params).path, token);
    } catch {
        return Response.json(
            {
                status: 503,
                code: 'backend_unavailable',
                title: 'The backend is unavailable.',
            },
            { status: 503, headers: { 'cache-control': 'no-store' } },
        );
    }
}
export {
    handle as GET,
    handle as POST,
    handle as PUT,
    handle as DELETE,
    handle as PATCH,
    handle as HEAD,
    handle as OPTIONS,
};
