using BikeLog.Api.Auth;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Maintenance;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Maintenance;

public static class MaintenanceEndpoints
{
    public static void MapMaintenance(this RouteGroupBuilder api)
    {
        api.MapPost(
                "/maintenance",
                async (
                    CreateMaintenance request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    MaintenanceInput.ValidateCost(request.Cost, request.Currency);
                    var r = await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            if (
                                !await db.Bikes.AnyAsync(
                                    x => x.OwnerId == owner.OwnerId && x.Id == request.BikeId,
                                    token
                                )
                            )
                            {
                                throw ApiInput.Missing();
                            }

                            ApiInput.Require(
                                request.TaskKey
                                    is null
                                        or MaintenanceRecord.ChainLubricationTaskKey,
                                "Unknown maintenance task key."
                            );
                            if (request.TaskKey is not null)
                            {
                                ApiInput.Require(
                                    request.ComponentId.HasValue,
                                    "Chain lubrication requires a chain association."
                                );
                                var chainComponent =
                                    await db
                                        .Components.AsNoTracking()
                                        .SingleOrDefaultAsync(
                                            x =>
                                                x.OwnerId == owner.OwnerId
                                                && x.Id == request.ComponentId,
                                            token
                                        )
                                    ?? throw ApiInput.Missing();
                                ApiInput.Require(
                                    chainComponent.Type == ComponentType.Chain,
                                    "Chain lubrication requires a chain association."
                                );
                                var performed = request.PerformedUtc.ToUniversalTime();
                                ApiInput.Require(
                                    await db.Installations.AnyAsync(
                                        x =>
                                            x.OwnerId == owner.OwnerId
                                            && x.BikeId == request.BikeId
                                            && x.ComponentId == chainComponent.Id
                                            && x.Position == InstallationPosition.Chain
                                            && x.StartUtc <= performed
                                            && (!x.EndUtc.HasValue || performed < x.EndUtc),
                                        token
                                    ),
                                    "The chain must be fitted at the maintenance instant."
                                );
                            }
                            var at = request.PerformedUtc.ToUniversalTime();
                            if (request.ComponentId is { } component)
                            {
                                if (
                                    !await db.Components.AnyAsync(
                                        x => x.OwnerId == owner.OwnerId && x.Id == component,
                                        token
                                    )
                                )
                                {
                                    throw ApiInput.Missing();
                                }

                                ApiInput.Require(
                                    await db.Installations.AnyAsync(
                                        x =>
                                            x.OwnerId == owner.OwnerId
                                            && x.ComponentId == component
                                            && x.BikeId == request.BikeId
                                            && x.StartUtc <= at
                                            && (!x.EndUtc.HasValue || at < x.EndUtc),
                                        token
                                    ),
                                    "The component must be fitted to this bike at the maintenance instant."
                                );
                            }
                            var r = new MaintenanceRecord
                            {
                                OwnerId = owner.OwnerId,
                                BikeId = request.BikeId,
                                ComponentId = request.ComponentId,
                                TaskKey = request.TaskKey,
                                Task = ApiInput.Text(request.Task, "task"),
                                PerformedUtc = at,
                                Notes = request.Notes,
                                Cost = request.Cost,
                                Currency = request.Currency,
                            };
                            db.MaintenanceRecords.Add(r);
                            return r;
                        },
                        false,
                        ct
                    );
                    return Results.Created($"/api/maintenance/{r.Id}", MaintenanceResponse.From(r));
                }
            )
            .Produces<MaintenanceResponse>(201)
            .WithDescription(
                "Record work without resetting component lifetime usage; cost/currency are optional together."
            );
        api.MapGet(
            "/maintenance/{id:guid}",
            async (Guid id, BikeLogDbContext db, ICurrentOwner owner, CancellationToken ct) =>
                MaintenanceResponse.From(
                    await db
                        .MaintenanceRecords.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct)
                        ?? throw ApiInput.Missing()
                )
        );
        api.MapGet(
            "/bikes/{id:guid}/maintenance",
            async (Guid id, BikeLogDbContext db, ICurrentOwner owner, CancellationToken ct) =>
            {
                if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct))
                {
                    throw ApiInput.Missing();
                }

                return (
                    await db
                        .MaintenanceRecords.AsNoTracking()
                        .Where(x => x.OwnerId == owner.OwnerId && x.BikeId == id)
                        .OrderBy(x => x.PerformedUtc)
                        .ToListAsync(ct)
                )
                    .Select(MaintenanceResponse.From)
                    .ToArray();
            }
        );
    }
}
