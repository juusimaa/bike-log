using BikeLog.Api.Features.Errors;
using BikeLog.Domain;
using BikeLog.Domain.Bikes;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Bikes;

public static class BikeGuards
{
    /// <summary>Rides and parts may only be added to an active bike (research D4).</summary>
    public static void RequireActive(Bike bike)
    {
        if (bike.Status == BikeStatus.Retired)
        {
            throw new DomainValidationException(
                "This bike is retired. Reactivate it first.",
                "bike_retired"
            );
        }
    }

    /// <summary>Loads an owner's bike that is not deleted and checks that it is active.</summary>
    public static async Task<Bike> RequireActiveAsync(
        BikeLogDbContext db,
        Guid ownerId,
        Guid bikeId,
        CancellationToken ct
    )
    {
        var bike =
            await db
                .Bikes.AsNoTracking()
                .SingleOrDefaultAsync(x => x.OwnerId == ownerId && x.Id == bikeId, ct)
            ?? throw ApiInput.Missing();
        RequireActive(bike);
        return bike;
    }
}
