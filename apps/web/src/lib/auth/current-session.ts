import { cookies } from 'next/headers';
import { getSessionStore } from './config';
import { SESSION_COOKIE, sessionIdFromCookie } from './cookies';
import type { SessionRecord } from './session-store';

export async function getWebSession(): Promise<SessionRecord | null> {
    const value = (await cookies()).get(SESSION_COOKIE)?.value;
    const id = sessionIdFromCookie(value ? `${SESSION_COOKIE}=${value}` : null);
    return id ? getSessionStore().get(id) : null;
}
