import Link from 'next/link';
import type { BikeResponse } from '@bikelog/api-client';
import { BikeArt } from './BikeArt';

type Kind = NonNullable<BikeResponse['kind']>;
const KINDS: Kind[] = ['road', 'gravel', 'mountain', 'hybrid', 'other'];

/** The page picks one per request, so each visit can show a different kind of bike. */
export function randomBikeKind(): Kind {
    return KINDS[Math.floor(Math.random() * KINDS.length)];
}

export function SignIn({ state = 'default', kind = 'road' }: { state?: 'default' | 'signed-out' | 'unavailable'; kind?: Kind }) {
    const title = state === 'signed-out' ? 'You’re signed out.' : state === 'unavailable' ? 'A small detour.' : 'Welcome back.';
    const description = state === 'signed-out'
        ? 'Your bike history will be here when you get back.'
        : state === 'unavailable'
          ? 'Sign-in is temporarily unavailable. Please try again in a moment.'
          : 'Your bikes, their history. All in one place.';
    return (
        <main className="auth-shell">
            <section className="auth-story">
                <Link className="brand" href="/" aria-label="Bike Log home"><span className="brand-mark">b<span>↗</span></span>bike log<span className="brand-dot">.</span></Link>
                <div className="auth-story-copy"><p className="auth-eyebrow">KEEP THE HISTORY. ENJOY THE RIDE.</p><h1>A little care.<br />A lot more miles.</h1><p>A place for every bike.<br />A story behind every kilometre.</p></div>
                <div className="auth-bike" aria-hidden="true"><span className="auth-orbit" /><BikeArt kind={kind} color="#345b43" /><div className="auth-bike-caption"><span className="auth-caption-dot" />Ready for the miles ahead.</div></div>
                <div className="auth-story-foot"><span>YOUR BIKES. YOUR HISTORY.</span><span>Made to go the distance. ↗</span></div>
            </section>
            <section className="auth-form-side">
                <div className="auth-mobile-brand"><Link className="brand" href="/" aria-label="Bike Log home"><span className="brand-mark">b<span>↗</span></span>bike log<span className="brand-dot">.</span></Link></div>
                <div className="auth-form-card">
                    <p className="auth-eyebrow">{state === 'signed-out' ? 'UNTIL THE NEXT RIDE' : state === 'unavailable' ? 'LET’S TRY THAT AGAIN' : 'YOUR NEXT RIDE STARTS HERE'}</p>
                    <h2>{title}</h2><p className="auth-subtitle">{description}</p>
                    <div className="auth-message"><span className="auth-message-icon" aria-hidden="true">✉</span><strong>Invited riders only</strong><p>Continue to Bike Log’s secure email code sign-in. Check your spam folder if the code does not arrive.</p></div>
                    <Link className="auth-primary" href="/auth/start?returnTo=%2F">Sign in with email code <span aria-hidden="true">↗</span></Link>
                    <p className="auth-private">♙ A personal space for your bike history.</p>
                </div>
                <footer className="auth-foot">Bike Log <span>Keep riding. We’ll keep the history.</span></footer>
            </section>
        </main>
    );
}
