using System.Data;
using System.Globalization;
using BikeLog.Api.Auth;
using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Api.Features.Reminders;
using BikeLog.Api.Features.Usage;
using BikeLog.Domain.Weights;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Bikes;

public static class BikeOverviewEndpoints
{
    public static void MapBikeOverview(this RouteGroupBuilder api)
    {
        api.MapGet(
            "/bikes/{id:guid}/overview",
            async (
                Guid id,
                BikeLogDbContext db,
                ICurrentOwner owner,
                BikeUsageReader usageReader,
                ReminderReader reminders,
                TimeProvider clock,
                CancellationToken ct
            ) =>
            {
                var now = clock.GetUtcNow();
                await using var snapshot = await db.Database.BeginTransactionAsync(
                    IsolationLevel.RepeatableRead,
                    ct
                );
                var bike =
                    await db
                        .Bikes.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct)
                    ?? throw ApiInput.Missing();
                var rides = await db
                    .Rides.AsNoTracking()
                    .Where(x => x.OwnerId == owner.OwnerId && x.BikeId == id)
                    .ToListAsync(ct);
                var maintenance = await db
                    .MaintenanceRecords.AsNoTracking()
                    .Where(x => x.OwnerId == owner.OwnerId && x.BikeId == id)
                    .ToListAsync(ct);
                long distance = 0;
                foreach (var ride in rides)
                {
                    distance = checked(distance + ride.DistanceMetres);
                }
                var usage = await usageReader.ReadAsync(owner.OwnerId, id, now, ct);
                var reminder = await reminders.ReadAsync(owner.OwnerId, id, now, ct);
                var fittedIds = usage.CurrentComponents.Select(x => x.ComponentId).ToArray();
                var weights = WeightSummary.Calculate(
                    await db
                        .Components.AsNoTracking()
                        .Where(x => x.OwnerId == owner.OwnerId && fittedIds.Contains(x.Id))
                        .ToListAsync(ct),
                    bike.FrameWeightGrams
                );
                var spending = maintenance
                    .Where(x => x.Cost.HasValue)
                    .GroupBy(x => x.Currency!)
                    .OrderBy(x => x.Key, StringComparer.Ordinal)
                    .Select(x => new CurrencySpend(x.Key, x.Sum(r => r.Cost!.Value)))
                    .ToArray();
                var activity = rides
                    .Select(x => new RecentActivity(
                        "ride",
                        x.Id,
                        x.Name
                            ?? $"Ride {x.StartUtc.UtcDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)}",
                        x.StartUtc,
                        null,
                        x.DistanceMetres
                    ))
                    .Concat(
                        maintenance.Select(x => new RecentActivity(
                            "maintenance",
                            x.Id,
                            x.Task,
                            x.PerformedUtc,
                            x.ComponentId,
                            null
                        ))
                    )
                    .OrderByDescending(x => x.Instant)
                    .ThenBy(x => x.Kind, StringComparer.Ordinal)
                    .ThenBy(x => x.Id)
                    .Take(3)
                    .ToArray();
                return new BikeOverviewResponse(
                    BikeResponse.From(
                        bike,
                        usage
                            .PositionStatuses.Where(x => x.State == "missing")
                            .Select(x => x.Position)
                            .ToArray()
                    ),
                    now,
                    rides.Count,
                    distance,
                    usage.CurrentComponents,
                    usage.AllocationGaps,
                    usage.PositionStatuses,
                    usage.PositionGaps,
                    spending,
                    maintenance.Count(x => !x.Cost.HasValue),
                    maintenance.Count,
                    activity,
                    reminder,
                    new WeightSummaryResponse(
                        weights
                            .Groups.Select(x => new GroupWeightResponse(
                                ComponentValues.Group(x.Group),
                                x.Grams,
                                x.MissingCount
                            ))
                            .ToArray(),
                        weights.FrameGrams,
                        weights.TotalGrams,
                        weights.MissingCount
                    )
                );
            }
        );
    }
}
