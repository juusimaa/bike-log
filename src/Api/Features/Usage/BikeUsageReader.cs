using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Api.Features.Installations;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Usage;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Usage;

public sealed class BikeUsageReader(BikeLogDbContext db, IUsageCalculator calculator)
{
    public async Task<BikeUsageResponse> ReadAsync(
        Guid ownerId,
        Guid id,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        if (!await db.Bikes.AnyAsync(x => x.OwnerId == ownerId && x.Id == id, ct))
        {
            throw ApiInput.Missing();
        }

        var rides = await db
            .Rides.AsNoTracking()
            .Where(x => x.OwnerId == ownerId && x.BikeId == id)
            .ToListAsync(ct);
        var installations = await db
            .Installations.AsNoTracking()
            .Where(x => x.OwnerId == ownerId && x.BikeId == id)
            .ToListAsync(ct);
        var calculation = calculator.Calculate(rides, installations);

        var current = installations
            .Where(x => x.StartUtc <= now && (!x.EndUtc.HasValue || now < x.EndUtc))
            .OrderBy(x => x.Position)
            .ToArray();
        var components = new List<CurrentComponentUsage>();
        CurrentChainUsage? chain = null;
        foreach (var installation in current)
        {
            var component = await db
                .Components.AsNoTracking()
                .SingleAsync(x => x.OwnerId == ownerId && x.Id == installation.ComponentId, ct);
            var estimate = component.InitialUsageEstimateMetres;
            var lifetime = await db
                .ComponentUsages.AsNoTracking()
                .SingleAsync(
                    x => x.OwnerId == ownerId && x.ComponentId == installation.ComponentId,
                    ct
                );
            var usage = await db
                .InstallationUsages.AsNoTracking()
                .SingleAsync(x => x.OwnerId == ownerId && x.InstallationId == installation.Id, ct);
            components.Add(
                new(
                    installation.ComponentId,
                    installation.Id,
                    ComponentValues.Position(installation.Position),
                    usage.Metres,
                    usage.Seconds,
                    usage.HasUnknownDuration,
                    lifetime.LifetimeMetres,
                    lifetime.LifetimeSeconds,
                    lifetime.HasUnknownDuration,
                    estimate,
                    UsageEstimate.Combined(lifetime.LifetimeMetres, estimate)
                )
            );
            if (installation.Position == InstallationPosition.Chain)
            {
                chain = new(
                    installation.ComponentId,
                    installation.Id,
                    usage.Metres,
                    usage.Seconds,
                    usage.HasUnknownDuration,
                    lifetime.LifetimeMetres,
                    lifetime.LifetimeSeconds,
                    lifetime.HasUnknownDuration,
                    estimate,
                    UsageEstimate.Combined(lifetime.LifetimeMetres, estimate)
                );
            }
        }
        var calculated = await db
            .InstallationUsages.Where(x =>
                x.OwnerId == ownerId && installations.Select(i => i.Id).Contains(x.InstallationId)
            )
            .Select(x => (DateTimeOffset?)x.CalculatedAtUtc)
            .MinAsync(ct);
        return new BikeUsageResponse(
            id,
            chain,
            calculation.UnallocatedRideIds,
            calculated,
            components,
            calculation
                .AllocationGaps.Select(x => new AllocationGapResponse(
                    x.RideId,
                    ComponentValues.Position(x.Position)
                ))
                .ToArray()
        );
    }
}
