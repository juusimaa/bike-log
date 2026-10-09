'use client';
import { useEffect, useRef } from 'react';

export type AccessIssue = 'expired' | 'pilot-access' | 'unavailable';
export function SessionExpired({ reason, onLeave, onRetry }: { reason: AccessIssue; onLeave: () => void; onRetry?: () => void }) {
    const action = useRef<HTMLButtonElement>(null);
    useEffect(() => { action.current?.focus(); }, []);
    const copy = reason === 'expired'
        ? { title: 'Pick up where you left off.', body: 'Your session has expired. Sign in again to return to your garage.', action: 'Sign in again' }
        : reason === 'pilot-access'
          ? { title: 'Your garage is not ready yet.', body: 'This account does not have Bike Log pilot access. Ask the pilot administrator to enable it.', action: 'Sign out' }
          : { title: 'A small detour.', body: 'Your garage is temporarily unavailable. Your unsent changes remain here until you choose to leave.', action: 'Sign out' };
    return <section className="auth-interruption" role="alertdialog" aria-modal="true" aria-labelledby="auth-interruption-title" aria-describedby="auth-interruption-body">
        <div className="auth-interruption-card"><p className="auth-eyebrow">KEEP THE HISTORY. ENJOY THE RIDE.</p><h2 id="auth-interruption-title">{copy.title}</h2><p id="auth-interruption-body">{copy.body}</p><div className="auth-interruption-actions"><button ref={action} className="button primary" onClick={onLeave}>{copy.action}</button>{reason === 'unavailable' && onRetry && <button className="button secondary" onClick={onRetry}>Retry</button>}</div></div>
    </section>;
}
