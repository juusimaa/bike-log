using Microsoft.EntityFrameworkCore;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Api.Development;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Maintenance;
using System.Text.RegularExpressions;
namespace BikeLog.Api.Features.Maintenance;

public static class MaintenanceEndpoints
{
    public static void MapMaintenance(this RouteGroupBuilder api)
    {
        api.MapPost("/maintenance", async (CreateMaintenance request, BikeLogDbContext db, OwnerMutation mutation, IDevelopmentOwner owner, CancellationToken ct) =>
        {
            ApiInput.Require((request.Cost == null && request.Currency == null) || (request.Cost is >= 0 and <= 9999999999999999.99m && decimal.Round(request.Cost.Value, 2) == request.Cost && request.Currency != null && Regex.IsMatch(request.Currency, "^[A-Z]{3}$")), "Cost must be nonnegative with up to two decimals and a three-letter uppercase currency, supplied together.");
            var r = await mutation.ExecuteAsync(owner.OwnerId, async token =>
            {
                if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == request.BikeId, token)) throw ApiInput.Missing(); var at = request.PerformedUtc.ToUniversalTime();
                if (request.ComponentId is { } component) { if (!await db.Components.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == component, token)) throw ApiInput.Missing(); ApiInput.Require(await db.Installations.AnyAsync(x => x.OwnerId == owner.OwnerId && x.ComponentId == component && x.BikeId == request.BikeId && x.StartUtc <= at && (!x.EndUtc.HasValue || at < x.EndUtc), token), "The component must be fitted to this bike at the maintenance instant."); }
                var r = new MaintenanceRecord { OwnerId = owner.OwnerId, BikeId = request.BikeId, ComponentId = request.ComponentId, Task = ApiInput.Text(request.Task, "task"), PerformedUtc = at, Notes = request.Notes, Cost = request.Cost, Currency = request.Currency }; db.MaintenanceRecords.Add(r); return r;
            }, false, ct); return Results.Created($"/api/maintenance/{r.Id}", MaintenanceResponse.From(r));
        }).Produces<MaintenanceResponse>(201).WithDescription("Record work without resetting component lifetime usage; cost/currency are optional together.");
        api.MapGet("/maintenance/{id:guid}", async (Guid id, BikeLogDbContext db, IDevelopmentOwner owner, CancellationToken ct) => MaintenanceResponse.From(await db.MaintenanceRecords.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct) ?? throw ApiInput.Missing()));
        api.MapGet("/bikes/{id:guid}/maintenance", async (Guid id, BikeLogDbContext db, IDevelopmentOwner owner, CancellationToken ct) =>
        {
            if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct)) throw ApiInput.Missing(); return (await db.MaintenanceRecords.AsNoTracking().Where(x => x.OwnerId == owner.OwnerId && x.BikeId == id).OrderBy(x => x.PerformedUtc).ToListAsync(ct)).Select(MaintenanceResponse.From).ToArray();
        });
    }
}
