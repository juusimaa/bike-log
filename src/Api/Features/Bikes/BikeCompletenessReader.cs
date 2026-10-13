using BikeLog.Api.Features.Components;
using BikeLog.Domain.Bikes;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Bikes;

public static class BikeCompletenessReader
{
    /// <summary>Missing positions per bike, read with one query per table for the whole set.</summary>
    public static async Task<Dictionary<Guid, IReadOnlyList<string>>> MissingAsync(
        BikeLogDbContext db,
        Guid owner,
        IReadOnlyCollection<Guid> bikeIds,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var installations = await db
            .Installations.AsNoTracking()
            .Where(x => x.OwnerId == owner && bikeIds.Contains(x.BikeId))
            .ToListAsync(ct);
        var exemptions = await db
            .PositionExemptions.AsNoTracking()
            .Where(x => x.OwnerId == owner && bikeIds.Contains(x.BikeId))
            .ToListAsync(ct);
        return bikeIds.ToDictionary(
            id => id,
            IReadOnlyList<string> (id) =>
                BikeCompleteness
                    .MissingPositions(id, installations, exemptions, now)
                    .Select(ComponentValues.Position)
                    .ToArray()
        );
    }

    public static async Task<BikeResponse> ResponseAsync(
        BikeLogDbContext db,
        Bike bike,
        DateTimeOffset now,
        CancellationToken ct
    ) =>
        BikeResponse.From(
            bike,
            (await MissingAsync(db, bike.OwnerId, [bike.Id], now, ct))[bike.Id]
        );
}
