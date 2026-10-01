using Microsoft.EntityFrameworkCore;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Api.Development;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Rides;
namespace BikeLog.Api.Features.Rides;

public static class RideEndpoints
{
    public static void MapRides(this RouteGroupBuilder api)
    {
        api.MapPost("/rides", async (CreateRide request, BikeLogDbContext db, OwnerMutation mutation, IDevelopmentOwner owner, CancellationToken ct) =>
        {
            var r = await mutation.ExecuteAsync(owner.OwnerId, async token =>
            {
                Validate(request.DistanceMetres, request.DurationSeconds); if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == request.BikeId, token)) throw ApiInput.Missing();
                var r = new Ride { OwnerId = owner.OwnerId, BikeId = request.BikeId, StartUtc = request.StartUtc.ToUniversalTime(), DistanceMetres = request.DistanceMetres, DurationSeconds = request.DurationSeconds }; db.Rides.Add(r); return r;
            }, true, ct); return Results.Created($"/api/rides/{r.Id}", RideResponse.From(r));
        }).Produces<RideResponse>(201).WithDescription("Manual synthetic ride: integer metres, optional positive seconds, UTC instant. Repeated POSTs create distinct rides; no offline deduplication yet.");
        api.MapGet("/rides/{id:guid}", async (Guid id, BikeLogDbContext db, IDevelopmentOwner owner, CancellationToken ct) => RideResponse.From(await db.Rides.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == owner.OwnerId, ct) ?? throw ApiInput.Missing()));
        api.MapPut("/rides/{id:guid}", async (Guid id, CorrectRide request, BikeLogDbContext db, OwnerMutation mutation, IDevelopmentOwner owner, CancellationToken ct) =>
        {
            var r = await mutation.ExecuteAsync(owner.OwnerId, async token =>
            {
                var r = await db.Rides.SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == owner.OwnerId, token) ?? throw ApiInput.Missing(); ApiInput.Version(request.ExpectedVersion, r.Version); Validate(request.DistanceMetres, request.DurationSeconds);
                if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == request.BikeId, token)) throw ApiInput.Missing(); r.BikeId = request.BikeId; r.StartUtc = request.StartUtc.ToUniversalTime(); r.DistanceMetres = request.DistanceMetres; r.DurationSeconds = request.DurationSeconds; r.Version = checked(r.Version + 1); return r;
            }, true, ct); return RideResponse.From(r);
        }).WithDescription("Correct a ride with expectedVersion; its history and rebuilt usage commit together.");
        api.MapDelete("/rides/{id:guid}", async (Guid id, long expectedVersion, BikeLogDbContext db, OwnerMutation mutation, IDevelopmentOwner owner, CancellationToken ct) =>
        {
            await mutation.ExecuteAsync(owner.OwnerId, async token => { var r = await db.Rides.SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == owner.OwnerId, token) ?? throw ApiInput.Missing(); ApiInput.Version(expectedVersion, r.Version); db.Rides.Remove(r); return 0; }, true, ct); return Results.NoContent();
        });
    }
    private static void Validate(long metres, long? seconds) => ApiInput.Require(metres > 0 && seconds is not <= 0, "Distance and supplied duration must be positive integers.");
}
