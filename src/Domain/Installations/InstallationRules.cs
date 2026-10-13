using BikeLog.Domain.Components;

namespace BikeLog.Domain.Installations;

public static class InstallationRules
{
    public static void Validate(IReadOnlyList<Installation> installations) =>
        Validate(installations, []);

    public static void Validate(
        IReadOnlyList<Installation> installations,
        IReadOnlyList<PositionExemption> exemptions
    )
    {
        foreach (var i in installations)
        {
            if (i.EndUtc is { } end && end <= i.StartUtc)
            {
                throw new DomainValidationException("Installation end must be after start.");
            }
        }

        foreach (var e in exemptions)
        {
            if (e.EndUtc is { } end && end <= e.StartUtc)
            {
                throw new DomainValidationException("Exemption end must be after start.");
            }
            if (ComponentCatalog.Entry(e.Position).Exemption != e.Reason)
            {
                throw new DomainValidationException(
                    "This position cannot be marked as intentionally empty for that reason."
                );
            }
        }

        for (var a = 0; a < installations.Count; a++)
        {
            for (var b = a + 1; b < installations.Count; b++)
            {
                var x = installations[a];
                var y = installations[b];
                if (x.OwnerId != y.OwnerId)
                {
                    continue;
                }

                var exclusive =
                    x.ComponentId == y.ComponentId
                    || (x.BikeId == y.BikeId && x.Position == y.Position);
                if (exclusive && Overlaps(x.StartUtc, x.EndUtc, y.StartUtc, y.EndUtc))
                {
                    throw Overlap();
                }
            }
        }

        for (var a = 0; a < exemptions.Count; a++)
        {
            var x = exemptions[a];
            for (var b = a + 1; b < exemptions.Count; b++)
            {
                var y = exemptions[b];
                if (
                    SamePosition(x.OwnerId, x.BikeId, x.Position, y.OwnerId, y.BikeId, y.Position)
                    && Overlaps(x.StartUtc, x.EndUtc, y.StartUtc, y.EndUtc)
                )
                {
                    throw Overlap();
                }
            }

            foreach (var i in installations)
            {
                if (
                    SamePosition(x.OwnerId, x.BikeId, x.Position, i.OwnerId, i.BikeId, i.Position)
                    && Overlaps(x.StartUtc, x.EndUtc, i.StartUtc, i.EndUtc)
                )
                {
                    throw Overlap();
                }
            }
        }
    }

    private static bool SamePosition(
        Guid ownerA,
        Guid bikeA,
        InstallationPosition positionA,
        Guid ownerB,
        Guid bikeB,
        InstallationPosition positionB
    ) => ownerA == ownerB && bikeA == bikeB && positionA == positionB;

    private static bool Overlaps(
        DateTimeOffset startA,
        DateTimeOffset? endA,
        DateTimeOffset startB,
        DateTimeOffset? endB
    ) => (!endB.HasValue || startA < endB) && (!endA.HasValue || startB < endA);

    private static DomainValidationException Overlap() =>
        new(
            "A component or bike position already has an overlapping installation.",
            "installation_overlap"
        );
}
