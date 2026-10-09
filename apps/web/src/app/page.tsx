import { createHash } from 'node:crypto';
import { SignIn } from '../components/SignIn';
import { HomeClient } from '../components/HomeClient';
import { getWebSession } from '../lib/auth/current-session';
import { authenticatedWebMode } from '../lib/proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ signedOut?: string }> }) {
    if (!authenticatedWebMode()) return <HomeClient identity="synthetic" authenticated={false} />;
    let session;
    try {
        session = await getWebSession();
    } catch {
        return <SignIn state="unavailable" />;
    }
    if (!session) return <SignIn state={(await searchParams).signedOut === '1' ? 'signed-out' : 'default'} />;
    const identity = createHash('sha256').update(`${session.issuer}\0${session.subject}`).digest('hex');
    return <HomeClient key={identity} identity={identity} authenticated />;
}
