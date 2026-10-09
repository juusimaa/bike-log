import { completeLogin } from '@/lib/auth/oidc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
    try {
        return await completeLogin(request);
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
