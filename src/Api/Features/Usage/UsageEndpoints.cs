using Microsoft.EntityFrameworkCore;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Api.Development;
using BikeLog.Api.Features.Errors;
using System.Data;
using BikeLog.Domain.Usage;
using BikeLog.Api.Features.Installations;
namespace BikeLog.Api.Features.Usage;

public static class UsageEndpoints
{
    public static void MapUsage(this RouteGroupBuilder api)
    {
        api.MapGet("/components/{id:guid}/usage", async (Guid id, BikeLogDbContext db, IDevelopmentOwner owner, CancellationToken ct) =>
        {
            await using var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
            if (!await db.Components.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct)) throw ApiInput.Missing();
            var usage = await db.ComponentUsages.AsNoTracking().SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.ComponentId == id, ct);
            var history = await db.Installations.AsNoTracking().Where(x => x.OwnerId == owner.OwnerId && x.ComponentId == id).OrderBy(x => x.StartUtc).ToListAsync(ct);
            var rows = await db.InstallationUsages.AsNoTracking().Where(x => x.OwnerId == owner.OwnerId).ToDictionaryAsync(x => x.InstallationId, ct);
            var items = history.Select(x => { rows.TryGetValue(x.Id, out var u); return new InstallationUsageResponse(InstallationResponse.From(x), u?.Metres ?? 0, u?.Seconds ?? 0, u?.HasUnknownDuration ?? false); }).ToArray();
            return new ComponentUsageResponse(id, usage?.LifetimeMetres ?? 0, usage?.LifetimeSeconds ?? 0, usage?.HasUnknownDuration ?? false, 0, items, usage?.CalculatedAtUtc);
        }).WithDescription("Lifetime and per-installation usage. Seconds include only known durations; hasUnknownDuration flags incomplete hours. Initial estimates are zero in this slice.");
        api.MapGet("/bikes/{id:guid}/usage", async (Guid id, BikeLogDbContext db, IDevelopmentOwner owner, IUsageCalculator calculator, CancellationToken ct) =>
        {
            await using var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
            if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct)) throw ApiInput.Missing();
            var rides = await db.Rides.AsNoTracking().Where(x => x.OwnerId == owner.OwnerId && x.BikeId == id).ToListAsync(ct);
            var installations = await db.Installations.AsNoTracking().Where(x => x.OwnerId == owner.OwnerId && x.BikeId == id).ToListAsync(ct);
            var gaps = calculator.Calculate(rides, installations).UnallocatedRideIds; var now = DateTimeOffset.UtcNow;
            var current = installations.SingleOrDefault(x => x.StartUtc <= now && (!x.EndUtc.HasValue || now < x.EndUtc)); CurrentChainUsage? chain = null;
            if (current != null) { var lifetime = await db.ComponentUsages.AsNoTracking().SingleAsync(x => x.OwnerId == owner.OwnerId && x.ComponentId == current.ComponentId, ct); var u = await db.InstallationUsages.AsNoTracking().SingleAsync(x => x.OwnerId == owner.OwnerId && x.InstallationId == current.Id, ct); chain = new(current.ComponentId, current.Id, u.Metres, u.Seconds, u.HasUnknownDuration, lifetime.LifetimeMetres, lifetime.LifetimeSeconds, lifetime.HasUnknownDuration, 0); }
            var calculated = await db.InstallationUsages.Where(x => x.OwnerId == owner.OwnerId && installations.Select(i => i.Id).Contains(x.InstallationId)).Select(x => (DateTimeOffset?)x.CalculatedAtUtc).MinAsync(ct);
            return new BikeUsageResponse(id, chain, gaps, calculated);
        }).WithDescription("Current chain as of now, explained totals and rides with missing chain installation history. Allocation gaps are not guessed.");
    }
}
