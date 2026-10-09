import { safeReturnPath, startLogin } from '@/lib/auth/oidc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
    const returnTo = new URL(request.url).searchParams.get('returnTo') ?? '/';
    try {
        safeReturnPath(returnTo);
    } catch {
        return Response.json(
            {
                code: 'invalid_return_path',
                message: 'The sign-in destination is invalid.',
            },
            { status: 400, headers: { 'cache-control': 'no-store' } },
        );
    }
    try {
        return await startLogin(returnTo);
    } catch {
        return Response.json(
            {
                code: 'sign_in_unavailable',
                message:
                    'Sign-in is temporarily unavailable. Please try again.',
            },
            { status: 503, headers: { 'cache-control': 'no-store' } },
        );
    }
}
