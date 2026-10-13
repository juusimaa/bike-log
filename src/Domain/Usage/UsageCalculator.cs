using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Rides;

namespace BikeLog.Domain.Usage;

public sealed class UsageCalculator : IUsageCalculator
{
    public UsageCalculation Calculate(
        IReadOnlyList<Ride> rides,
        IReadOnlyList<Installation> installations,
        IReadOnlyList<PositionExemption>? exemptions = null
    )
    {
        exemptions ??= [];
        InstallationRules.Validate(installations, exemptions);
        var totals = installations.ToDictionary(
            x => x.Id,
            x => new InstallationUsage(x.Id, 0, 0, false)
        );
        var gaps = new List<(Ride Ride, InstallationPosition Position)>();
        foreach (var ride in rides)
        {
            if (ride.DistanceMetres <= 0 || ride.DurationSeconds is <= 0)
            {
                throw new DomainValidationException(
                    "Distance and supplied duration must be positive."
                );
            }

            var matches = installations
                .Where(x =>
                    x.OwnerId == ride.OwnerId
                    && x.BikeId == ride.BikeId
                    && x.StartUtc <= ride.StartUtc
                    && (!x.EndUtc.HasValue || ride.StartUtc < x.EndUtc)
                )
                .ToArray();
            foreach (var entry in ComponentCatalog.Entries)
            {
                // An intentionally empty position needs no component; it is never a gap.
                if (
                    !matches.Any(x => x.Position == entry.Position)
                    && !exemptions.Any(x =>
                        x.OwnerId == ride.OwnerId
                        && x.BikeId == ride.BikeId
                        && x.Position == entry.Position
                        && x.StartUtc <= ride.StartUtc
                        && (!x.EndUtc.HasValue || ride.StartUtc < x.EndUtc)
                    )
                )
                {
                    gaps.Add((ride, entry.Position));
                }
            }

            foreach (var i in matches)
            {
                var previous = totals[i.Id];
                totals[i.Id] = previous with
                {
                    Metres = checked(previous.Metres + ride.DistanceMetres),
                    Seconds = checked(previous.Seconds + (ride.DurationSeconds ?? 0)),
                    HasUnknownDuration =
                        previous.HasUnknownDuration || !ride.DurationSeconds.HasValue,
                };
            }
        }
        var components = installations
            .GroupBy(x => x.ComponentId)
            .OrderBy(x => x.Key)
            .Select(group =>
            {
                long metres = 0,
                    seconds = 0;
                bool unknown = false;
                foreach (var i in group)
                {
                    var u = totals[i.Id];
                    metres = checked(metres + u.Metres);
                    seconds = checked(seconds + u.Seconds);
                    unknown |= u.HasUnknownDuration;
                }
                return new ComponentUsage(group.Key, metres, seconds, unknown);
            })
            .ToArray();
        return new(
            components,
            totals.Values.OrderBy(x => x.InstallationId).ToArray(),
            gaps.Where(x => x.Position == InstallationPosition.Chain)
                .Select(x => x.Ride.Id)
                .Order()
                .ToArray(),
            gaps.Select(x => new AllocationGap(x.Ride.Id, x.Position))
                .OrderBy(x => x.RideId)
                .ThenBy(x => ComponentCatalog.OrderOf(x.Position))
                .ToArray(),
            gaps.GroupBy(x => (x.Ride.BikeId, x.Position))
                .Select(g => new PositionGap(
                    g.Key.BikeId,
                    g.Key.Position,
                    g.Count(),
                    g.Min(x => x.Ride.StartUtc),
                    g.Max(x => x.Ride.StartUtc)
                ))
                .OrderBy(x => x.BikeId)
                .ThenBy(x => ComponentCatalog.OrderOf(x.Position))
                .ToArray()
        );
    }
}
