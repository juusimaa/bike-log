using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;

namespace BikeLog.Domain.Bikes;

public enum PositionState
{
    Fitted,
    Exempt,
    Missing,
    NotRecorded,
}

public sealed record PositionStatus(
    InstallationPosition Position,
    PositionState State,
    Installation? Installation,
    PositionExemption? Exemption,
    DateTimeOffset? SinceUtc
);

/// <summary>
/// What each catalog position holds at an instant. A position is missing when it is empty, not
/// exempt, and this bike had a part or an intentionally empty period there that has ended; a
/// position that never had either is only not recorded. Missing positions make a bike incomplete.
/// </summary>
public static class BikeCompleteness
{
    public static IReadOnlyList<PositionStatus> Statuses(
        Guid bikeId,
        IEnumerable<Installation> installations,
        IEnumerable<PositionExemption> exemptions,
        DateTimeOffset now
    )
    {
        var fitted = installations.Where(x => x.BikeId == bikeId).ToArray();
        var empty = exemptions.Where(x => x.BikeId == bikeId).ToArray();
        return ComponentCatalog
            .Entries.Select(entry =>
            {
                var position = entry.Position;
                var current = fitted.FirstOrDefault(x =>
                    x.Position == position && Covers(x.StartUtc, x.EndUtc, now)
                );
                if (current is not null)
                {
                    return new PositionStatus(
                        position,
                        PositionState.Fitted,
                        current,
                        null,
                        current.StartUtc
                    );
                }
                var exempt = empty.FirstOrDefault(x =>
                    x.Position == position && Covers(x.StartUtc, x.EndUtc, now)
                );
                if (exempt is not null)
                {
                    return new PositionStatus(
                        position,
                        PositionState.Exempt,
                        null,
                        exempt,
                        exempt.StartUtc
                    );
                }
                var ended = fitted
                    .Where(x => x.Position == position && x.EndUtc <= now)
                    .Select(x => x.EndUtc)
                    .Concat(
                        empty
                            .Where(x => x.Position == position && x.EndUtc <= now)
                            .Select(x => x.EndUtc)
                    )
                    .Max();
                return ended is { } since
                    ? new PositionStatus(position, PositionState.Missing, null, null, since)
                    : new PositionStatus(position, PositionState.NotRecorded, null, null, null);
            })
            .ToArray();
    }

    public static IReadOnlyList<InstallationPosition> MissingPositions(
        Guid bikeId,
        IEnumerable<Installation> installations,
        IEnumerable<PositionExemption> exemptions,
        DateTimeOffset now
    ) =>
        Statuses(bikeId, installations, exemptions, now)
            .Where(x => x.State == PositionState.Missing)
            .Select(x => x.Position)
            .ToArray();

    private static bool Covers(DateTimeOffset start, DateTimeOffset? end, DateTimeOffset now) =>
        start <= now && (!end.HasValue || now < end);
}
