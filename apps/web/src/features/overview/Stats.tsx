import type { BikeOverviewResponse, Validated } from '@bikelog/api-client';
import { formatKilometres, formatEuroCost } from '../../lib/format';
export function Stats({
    snapshot: s,
}: {
    snapshot: Validated<BikeOverviewResponse>;
}) {
    const chain = s.currentComponents.find(
        (component) => component.position === 'chain',
    );
    return (
        <section className="stats" aria-label="Bike statistics">
            <div className="card stat">
                <p className="stat-label">
                    Recorded distance <span aria-hidden="true">↗</span>
                </p>
                <p className="stat-value">
                    {formatKilometres(s.recordedDistanceMetres)}{' '}
                    <small>km</small>
                </p>
                <p className="stat-caption">{s.rideCount} recorded rides</p>
            </div>
            <div className="card stat">
                <p className="stat-label">
                    Current chain <span aria-hidden="true">⌁</span>
                </p>
                <p className="stat-value">
                    {chain ? (
                        <>
                            {formatKilometres(chain.lifetimeMetres)}{' '}
                            <small>km</small>
                        </>
                    ) : (
                        'Not fitted'
                    )}
                </p>
                <p className="stat-caption">Calculated lifetime distance</p>
            </div>
            <div className="card stat">
                <p className="stat-label">
                    Maintenance spend <span aria-hidden="true">€</span>
                </p>
                {s.spendingByCurrency.map((c) => (
                    <p key={c.currency} className="stat-value">
                        {c.currency === 'EUR'
                            ? formatEuroCost(c.amount)
                            : `${c.currency} ${c.amount.toFixed(2)}`}
                    </p>
                ))}
                {!s.spendingByCurrency.length && (
                    <p className="stat-caption">No known spending</p>
                )}
                <p className="stat-caption">
                    {s.maintenanceRecordCount} service records
                    {s.unknownCostRecordCount > 0 && (
                        <>
                            <br />
                            <span>
                                {s.unknownCostRecordCount} records with unknown
                                cost
                            </span>
                        </>
                    )}
                </p>
            </div>
        </section>
    );
}
