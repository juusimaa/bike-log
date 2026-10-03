import Link from 'next/link';
import type { ReactNode } from 'react';
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
}: {
    view: View;
    onNavigate: (view: View) => void;
    hrefFor: (view: View) => string;
    children: ReactNode;
    navigationLocked?: boolean;
}) {
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
                        b<span>✦</span>
                    </span>
                    bike log<span className="brand-dot">.</span>
                </Link>
                <div className="workspace">
                    Local workspace<small>Synthetic data only</small>
                </div>
                <p className="nav-label">YOUR GARAGE</p>
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
                                {['▦', '⚙', '↗', '◇'][i]}
                            </span>
                            {viewTitles[v]}
                        </a>
                    ))}
                </nav>
                <div className="sidebar-note">
                    <strong>
                        A little care.
                        <br />A longer ride.
                    </strong>
                    <p>Keep track of the parts that keep you moving.</p>
                </div>
                <div className="sidebar-footer">
                    <span className="demo-dot" />
                    Local synthetic workspace
                </div>
            </aside>
            <div className="main-shell">
                <header className="topbar">
                    <strong>Your garage / {viewTitles[view]}</strong>
                    <div className="demo-pill">LOCAL · SYNTHETIC</div>
                </header>
                <main>
                    {children}
                    <footer className="page-footer">
                        <span>Bike Log</span>
                        <span>Recorded usage and service history</span>
                    </footer>
                </main>
            </div>
        </>
    );
}
