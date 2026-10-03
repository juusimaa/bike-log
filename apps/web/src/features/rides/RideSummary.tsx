import type { CreateRide, RideResponse, Validated } from '@bikelog/api-client';
import { formatDateTime } from '../../lib/dates';
import { formatKilometres, formatDuration } from '../../lib/format';
export function RideSummary({
    ride,
}: {
    ride: Validated<RideResponse> | CreateRide;
}) {
    return (
        <>
            <p>
                {ride.name || formatDateTime(ride.startUtc).replace('T', ' ')} ·{' '}
                {formatKilometres(Number(ride.distanceMetres))} km ·{' '}
                {formatDuration(
                    ride.durationSeconds == null
                        ? null
                        : Number(ride.durationSeconds),
                )}
                {'version' in ride && <> · Saved version {ride.version}</>}
            </p>
            <p>
                Start time:{' '}
                <time dateTime={ride.startUtc}>{ride.startUtc}</time>
            </p>
        </>
    );
}
