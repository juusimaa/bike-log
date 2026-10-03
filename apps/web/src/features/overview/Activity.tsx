import { formatDateTime } from '../../lib/dates';
import { formatKilometres } from '../../lib/format';
import type { BikeOverviewResponse, Validated } from '@bikelog/api-client';
export function Activity({
    snapshot,
}: {
    snapshot: Validated<BikeOverviewResponse>;
}) {
    return (
        <section className="card activity-card">
            <div className="card-title">
                <h2>The latest chapter</h2>
                <span className="count">RECENT ACTIVITY</span>
            </div>
            <div className="activity-list">
                {snapshot.recentActivity.map((a) => (
                    <div
                        className={`activity ${a.kind}`}
                        key={`${a.kind}:${a.id}`}
                    >
                        <span className="activity-icon" aria-hidden="true">
                            {a.kind === 'ride' ? '↗' : '⌁'}
                        </span>
                        <div>
                            <strong>{a.title}</strong>
                            {a.rideDistanceMetres !== null && (
                                <p>
                                    {formatKilometres(a.rideDistanceMetres)} km
                                    · Manual ride
                                </p>
                            )}
                            <time dateTime={a.instant}>
                                {formatDateTime(a.instant)}
                            </time>
                        </div>
                    </div>
                ))}
                {!snapshot.recentActivity.length && <p>No activity recorded</p>}
            </div>
        </section>
    );
}
