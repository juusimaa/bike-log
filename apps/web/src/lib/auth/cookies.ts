export const SESSION_COOKIE = '__Host-bikelog_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function sessionCookie(id: string): string {
    return `${SESSION_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; Secure; HttpOnly; SameSite=Lax`;
}

export function clearSessionCookie(): string {
    return `${SESSION_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

export function sessionIdFromCookie(header: string | null): string | null {
    const cookie = header
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    if (!cookie) return null;
    const value = cookie.slice(SESSION_COOKIE.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
