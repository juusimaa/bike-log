'use client';
import { useEffect, useState } from 'react';
const VISIBLE_MS = 6000;
/**
 * Keep mounted so screen readers announce subsequent save messages. A new `seq`
 * re-announces an identical message; each message hides itself after a few seconds.
 */
export function Toast({
    message,
    seq = 0,
}: {
    message: string | null;
    seq?: number;
}) {
    const shown = `${seq}:${message}`;
    const [expired, setExpired] = useState<string | null>(null);
    useEffect(() => {
        if (!message) return;
        const timer = window.setTimeout(() => setExpired(shown), VISIBLE_MS);
        return () => window.clearTimeout(timer);
    }, [message, shown]);
    const visible = !!message && expired !== shown;
    return (
        <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={`toast${visible ? ' visible' : ''}`}
        >
            {message && <span key={seq}>{message}</span>}
        </div>
    );
}
