import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import type { View } from '@bikelog/api-client';
export const viewTitles = {
    overview: 'Overview',
    components: 'Components',
    rides: 'Rides',
    maintenance: 'Maintenance',
};
export function AppShell({
    view,
    onNavigate,
    hrefFor,
    children,
    navigationLocked = false,
    onSignOut,
}: {
    view: View;
    onNavigate: (view: View) => void;
    hrefFor: (view: View) => string;
    children: ReactNode;
    navigationLocked?: boolean;
    onSignOut?: () => void;
}) {
    const [accountOpen, setAccountOpen] = useState(false);
    useEffect(() => {
        if (!accountOpen) return;
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountOpen(false); };
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [accountOpen]);
    return (
        <>
            <aside className="sidebar">
                <Link
                    className="brand"
                    aria-disabled={navigationLocked || undefined}
                    href="/"
                    onClick={(e) => {
                        e.preventDefault();
                        onNavigate('overview');
                    }}
                >
                    <span className="brand-mark">
                        b<span>↗</span>
                    </span>
                    bike log<span className="brand-dot">.</span>
                </Link>
                <div className="workspace">
                    <span className="avatar" aria-hidden="true">
                        BL
                    </span>
                    <div>
                        Your garage<small>Personal workspace</small>
                    </div>
                </div>
                <p className="nav-label">WORKSPACE</p>
                <nav aria-label="Main navigation">
                    {(Object.keys(viewTitles) as View[]).map((v, i) => (
                        <a
                            key={v}
                            aria-label={viewTitles[v]}
                            aria-disabled={navigationLocked || undefined}
                            href={hrefFor(v)}
                            aria-current={v === view ? 'page' : undefined}
                            className={v === view ? 'active' : ''}
                            onClick={(e) => {
                                e.preventDefault();
                                onNavigate(v);
                            }}
                        >
                            <span className="nav-icon" aria-hidden="true">
                                {['▦', '⚙', '↗', '⌁'][i]}
                            </span>
                            {viewTitles[v]}
                        </a>
                    ))}
                </nav>
                <div className="sidebar-note">
                    <span className="little-leaf" aria-hidden="true">
                        ✳
                    </span>
                    <strong>
                        A little care.
                        <br />A lot more miles.
                    </strong>
                    <p>Keep the history. Enjoy the ride.</p>
                </div>
                <div className="sidebar-footer"><span className="demo-dot" />{onSignOut ? 'Personal workspace' : 'Local synthetic workspace'}</div>
            </aside>
            <div className="main-shell">
                <header className="topbar">
                    <div>
                        Your garage <span>/</span>{' '}
                        <strong>{viewTitles[view]}</strong>
                    </div>
                    <div className="topbar-right">
                        {onSignOut ? <div className="account-wrap"><button type="button" className="account-trigger" aria-label="Open account menu" aria-expanded={accountOpen} aria-controls="account-menu" onClick={() => setAccountOpen(!accountOpen)}><span className="avatar small" aria-hidden="true">BL</span><span className="account-name">Your account</span>⌄</button>{accountOpen && <div className="account-panel" id="account-menu"><strong>Your account</strong><p>Personal garage</p><div className="account-private">Only your bike history is shown here.</div><button type="button" onClick={() => { setAccountOpen(false); onSignOut(); }}>Sign out <span aria-hidden="true">↗</span></button></div>}</div> : <><span className="demo-pill">LOCAL · SYNTHETIC</span><span className="avatar small" aria-hidden="true">BL</span></>}
                    </div>
                </header>
                <main>
                    {children}
                    <footer className="page-footer">
                        <span>Made for the miles ahead.</span>
                        <span>Recorded usage and service history</span>
                    </footer>
                </main>
            </div>
        </>
    );
}
