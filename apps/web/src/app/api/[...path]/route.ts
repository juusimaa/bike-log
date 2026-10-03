import { forwardApi } from '@/lib/proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
    return forwardApi(request, (await context.params).path);
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
