using System.Data;
using BikeLog.Api.Development;
using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Api.Features.Installations;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Usage;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Usage;

public static class UsageEndpoints
{
    public static void MapUsage(this RouteGroupBuilder api)
    {
        api.MapGet(
                "/components/{id:guid}/usage",
                async (
                    Guid id,
                    BikeLogDbContext db,
                    IDevelopmentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    await using var snapshot = await db.Database.BeginTransactionAsync(
                        IsolationLevel.RepeatableRead,
                        ct
                    );
                    var component =
                        await db
                            .Components.AsNoTracking()
                            .SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct)
                        ?? throw ApiInput.Missing();

                    var usage = await db
                        .ComponentUsages.AsNoTracking()
                        .SingleOrDefaultAsync(
                            x => x.OwnerId == owner.OwnerId && x.ComponentId == id,
                            ct
                        );
                    var history = await db
                        .Installations.AsNoTracking()
                        .Where(x => x.OwnerId == owner.OwnerId && x.ComponentId == id)
                        .OrderBy(x => x.StartUtc)
                        .ToListAsync(ct);
                    var rows = await db
                        .InstallationUsages.AsNoTracking()
                        .Where(x => x.OwnerId == owner.OwnerId)
                        .ToDictionaryAsync(x => x.InstallationId, ct);
                    var items = history
                        .Select(x =>
                        {
                            rows.TryGetValue(x.Id, out var u);
                            return new InstallationUsageResponse(
                                InstallationResponse.From(x),
                                u?.Metres ?? 0,
                                u?.Seconds ?? 0,
                                u?.HasUnknownDuration ?? false
                            );
                        })
                        .ToArray();
                    return new ComponentUsageResponse(
                        id,
                        usage?.LifetimeMetres ?? 0,
                        usage?.LifetimeSeconds ?? 0,
                        usage?.HasUnknownDuration ?? false,
                        component.InitialUsageEstimateMetres,
                        items,
                        usage?.CalculatedAtUtc,
                        UsageEstimate.Combined(
                            usage?.LifetimeMetres ?? 0,
                            component.InitialUsageEstimateMetres
                        )
                    );
                }
            )
            .WithDescription(
                "Lifetime and per-installation usage. Seconds include only known durations; hasUnknownDuration flags incomplete hours. Estimates are separate from calculated usage."
            );
        api.MapGet(
                "/bikes/{id:guid}/usage",
                async (
                    Guid id,
                    BikeLogDbContext db,
                    IDevelopmentOwner owner,
                    BikeUsageReader reader,
                    TimeProvider clock,
                    CancellationToken ct
                ) =>
                {
                    await using var snapshot = await db.Database.BeginTransactionAsync(
                        IsolationLevel.RepeatableRead,
                        ct
                    );
                    return await reader.ReadAsync(owner.OwnerId, id, clock.GetUtcNow(), ct);
                }
            )
            .WithDescription(
                "Current components as of now, explained totals and missing installation history by position. Allocation gaps are not guessed."
            );
    }
}
