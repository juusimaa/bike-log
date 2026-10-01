using BikeLog.Api.Development;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Installations;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace BikeLog.Api.Features.Installations;

public static class InstallationEndpoints
{
    public static void MapInstallations(this RouteGroupBuilder api)
    {
        api.MapPost("/installations", async (CreateInstallation request, BikeLogDbContext db, OwnerMutation mutation, IDevelopmentOwner owner, CancellationToken ct) =>
        {
            ApiInput.Require(request.Position == "chain", "Only position 'chain' is supported in this slice.");
            var i = await mutation.ExecuteAsync(owner.OwnerId, async token =>
            {
                if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == request.BikeId, token) || !await db.Components.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == request.ComponentId, token))
                {
                    throw ApiInput.Missing();
                }

                var i = new Installation { OwnerId = owner.OwnerId, BikeId = request.BikeId, ComponentId = request.ComponentId, StartUtc = request.StartUtc.ToUniversalTime(), EndUtc = request.EndUtc?.ToUniversalTime() };
                var all = await db.Installations.Where(x => x.OwnerId == owner.OwnerId).ToListAsync(token);
                all.Add(i);
                await ValidateHistory(all, db, owner.OwnerId, token);
                db.Installations.Add(i);
                return i;
            }, true, ct);
            return Results.Created($"/api/installations/{i.Id}", InstallationResponse.From(i));
        }).Produces<InstallationResponse>(201).WithDescription("Install a chain using [startUtc,endUtc) UTC intervals. Whole rides allocate by start instant.");
        api.MapGet("/installations/{id:guid}", async (Guid id, BikeLogDbContext db, IDevelopmentOwner owner, CancellationToken ct) => InstallationResponse.From(await db.Installations.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && x.OwnerId == owner.OwnerId, ct) ?? throw ApiInput.Missing()));
        api.MapPut("/installations/{id:guid}", async (Guid id, CorrectInstallation request, BikeLogDbContext db, OwnerMutation mutation, IDevelopmentOwner owner, CancellationToken ct) =>
        {
            var i = await mutation.ExecuteAsync(owner.OwnerId, async token =>
            {
                var i = await db.Installations.SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, token) ?? throw ApiInput.Missing();
                ApiInput.Version(request.ExpectedVersion, i.Version);
                i.StartUtc = request.StartUtc.ToUniversalTime();
                i.EndUtc = request.EndUtc?.ToUniversalTime();
                i.Version = checked(i.Version + 1);
                await ValidateHistory(await db.Installations.Where(x => x.OwnerId == owner.OwnerId).ToListAsync(token), db, owner.OwnerId, token);
                return i;
            }, true, ct);
            return InstallationResponse.From(i);
        }).WithDescription("Correct dates with expectedVersion. Overlaps and stale versions return 409; totals rebuild atomically.");
        api.MapPost("/installations/{id:guid}/replacement", async (Guid id, ReplaceInstallation request, BikeLogDbContext db, OwnerMutation mutation, IDevelopmentOwner owner, CancellationToken ct) =>
        {
            return await mutation.ExecuteAsync(owner.OwnerId, async token =>
            {
                var old = await db.Installations.SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, token) ?? throw ApiInput.Missing();
                ApiInput.Version(request.ExpectedInstallationVersion, old.Version);
                if (!await db.Components.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == request.NewComponentId, token))
                {
                    throw ApiInput.Missing();
                }

                var at = request.ReplacedAtUtc.ToUniversalTime();
                ApiInput.Require(old.EndUtc == null && at > old.StartUtc && request.NewComponentId != old.ComponentId, "Replacement requires an open interval, a later instant and a different chain.");
                old.EndUtc = at;
                old.Version = checked(old.Version + 1);
                var next = new Installation { OwnerId = owner.OwnerId, BikeId = old.BikeId, ComponentId = request.NewComponentId, StartUtc = at };
                var all = await db.Installations.Where(x => x.OwnerId == owner.OwnerId).ToListAsync(token);
                all.Add(next);
                await ValidateHistory(all, db, owner.OwnerId, token);
                db.Installations.Add(next);
                return new
                {
                    oldInstallation = InstallationResponse.From(old),
                    newInstallation = InstallationResponse.From(next)
                };
            }, true, ct);
        });
    }
    private static async Task ValidateHistory(IReadOnlyList<Installation> proposed, BikeLogDbContext db, Guid owner, CancellationToken ct)
    {
        InstallationRules.Validate(proposed);
        MaintenanceHistoryRules.Validate(proposed, await db.MaintenanceRecords.AsNoTracking().Where(x => x.OwnerId == owner).ToListAsync(ct));
    }
}
