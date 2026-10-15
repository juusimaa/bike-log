using BikeLog.Api.Auth;
using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Installations;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Bikes;

public static class BikeLifecycleEndpoints
{
    public static void MapBikeLifecycle(this RouteGroupBuilder api)
    {
        api.MapPut(
                "/bikes/{id:guid}/status",
                async (
                    Guid id,
                    SetBikeStatus request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    TimeProvider clock,
                    CancellationToken ct
                ) =>
                {
                    var status = request.Status switch
                    {
                        "active" => BikeStatus.Active,
                        "retired" => BikeStatus.Retired,
                        _ => throw new ApiException(
                            400,
                            "invalid_input",
                            "Status must be active or retired."
                        ),
                    };
                    var bike = await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            var b =
                                await db.Bikes.SingleOrDefaultAsync(
                                    x => x.Id == id && x.OwnerId == owner.OwnerId,
                                    token
                                ) ?? throw ApiInput.Missing();
                            ApiInput.Version(request.ExpectedVersion, b.Version);
                            if (b.Status != status)
                            {
                                if (status == BikeStatus.Retired)
                                {
                                    b.Retire();
                                }
                                else
                                {
                                    b.Reactivate();
                                }
                                b.Version = checked(b.Version + 1);
                            }
                            return b;
                        },
                        false,
                        ct
                    );
                    return await BikeCompletenessReader.ResponseAsync(
                        db,
                        bike,
                        clock.GetUtcNow(),
                        ct
                    );
                }
            )
            .Produces<BikeResponse>()
            .WithDescription(
                "Retire or reactivate a bike with expectedVersion. A retired bike keeps its history but takes no new rides or parts."
            );
        api.MapGet(
                "/bikes/{id:guid}/deletion-preview",
                async (
                    Guid id,
                    BikeLogDbContext db,
                    ICurrentOwner owner,
                    TimeProvider clock,
                    CancellationToken ct
                ) =>
                {
                    await using var snapshot = await db.Database.BeginTransactionAsync(
                        System.Data.IsolationLevel.RepeatableRead,
                        ct
                    );
                    var bike =
                        await db
                            .Bikes.AsNoTracking()
                            .SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct)
                        ?? throw ApiInput.Missing();
                    return await PreviewAsync(db, bike, clock.GetUtcNow(), ct);
                }
            )
            .Produces<BikeDeletionPreview>()
            .WithDescription(
                "The parts fitted now, the rides that will be kept and the maintenance records that will be deleted with the bike."
            );
        api.MapPost(
                "/bikes/{id:guid}/delete",
                async (
                    Guid id,
                    DeleteBike request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    TimeProvider clock,
                    CancellationToken ct
                ) =>
                {
                    var now = clock.GetUtcNow();
                    await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            await DeleteAsync(db, owner.OwnerId, id, request, now, token);
                            return 0;
                        },
                        true,
                        ct
                    );
                    return Results.NoContent();
                }
            )
            .Produces(204)
            .WithDescription(
                "Permanently delete a bike in one transaction: kept parts become spares, other fitted parts, maintenance, the reminder rule and exemptions are deleted, and rides stay under the bike's name."
            );
    }

    /// <summary>Installations that are fitted now or later; these are what the owner decides about.</summary>
    private static IQueryable<Installation> Fitted(
        BikeLogDbContext db,
        Bike bike,
        DateTimeOffset now
    ) =>
        db.Installations.Where(x =>
            x.OwnerId == bike.OwnerId && x.BikeId == bike.Id && (x.EndUtc == null || x.EndUtc > now)
        );

    private static async Task<BikeDeletionPreview> PreviewAsync(
        BikeLogDbContext db,
        Bike bike,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var fitted = await Fitted(db, bike, now).AsNoTracking().ToListAsync(ct);
        var ids = fitted.Select(x => x.ComponentId).ToArray();
        var components = await db
            .Components.AsNoTracking()
            .Where(x => x.OwnerId == bike.OwnerId && ids.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        return new(
            bike.Version,
            fitted
                .OrderBy(x => x.Position)
                .ThenBy(x => x.StartUtc)
                .Select(x => new FittedPartPreview(
                    x.Id,
                    x.ComponentId,
                    ComponentValues.Type(components[x.ComponentId].Type),
                    components[x.ComponentId].Make,
                    components[x.ComponentId].Model,
                    ComponentValues.Position(x.Position)
                ))
                .ToArray(),
            await db.Rides.CountAsync(x => x.OwnerId == bike.OwnerId && x.BikeId == bike.Id, ct),
            await db.MaintenanceRecords.CountAsync(
                x => x.OwnerId == bike.OwnerId && x.BikeId == bike.Id,
                ct
            )
        );
    }

    /// <summary>Bike deletion steps of research D9, run inside one owner mutation.</summary>
    private static async Task DeleteAsync(
        BikeLogDbContext db,
        Guid ownerId,
        Guid id,
        DeleteBike request,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var bike =
            await db.Bikes.SingleOrDefaultAsync(x => x.OwnerId == ownerId && x.Id == id, ct)
            ?? throw ApiInput.Missing();
        ApiInput.Version(request.ExpectedVersion, bike.Version);
        var fitted = await Fitted(db, bike, now).ToListAsync(ct);
        // The bike's version does not change when parts are fitted, so the fitted set the owner
        // saw is the conflict check.
        if (!fitted.Select(x => x.Id).ToHashSet().SetEquals(request.FittedInstallationIds))
        {
            throw new ApiException(
                409,
                "bike_parts_changed",
                "The parts fitted to this bike changed. Review them and confirm again.",
                extensions: new Dictionary<string, object?>
                {
                    ["preview"] = await PreviewAsync(db, bike, now, ct),
                }
            );
        }
        var keep = request.KeepComponentIds.ToHashSet();
        ApiInput.Require(
            keep.IsSubsetOf(fitted.Select(x => x.ComponentId)),
            "Only parts fitted to this bike can be kept."
        );

        foreach (var installation in fitted.Where(x => keep.Contains(x.ComponentId)))
        {
            if (installation.StartUtc < now)
            {
                installation.EndUtc = now;
                installation.Version = checked(installation.Version + 1);
            }
            else
            {
                // A fitting that has not started yet carries no usage; the kept part is simply spare.
                db.Installations.Remove(installation);
            }
        }
        await db.SaveChangesAsync(ct);
        foreach (var installation in fitted.Where(x => !keep.Contains(x.ComponentId)))
        {
            // Deleted below in SQL; a tracked copy would block removing the bike row.
            db.Entry(installation).State = EntityState.Detached;
        }
        foreach (
            var component in fitted
                .Select(x => x.ComponentId)
                .Where(x => !keep.Contains(x))
                .Distinct()
        )
        {
            await ComponentDeletion.DeleteAsync(db, ownerId, component, ct);
        }
        await db
            .MaintenanceRecords.Where(x => x.OwnerId == ownerId && x.BikeId == id)
            .ExecuteDeleteAsync(ct);
        await db
            .ChainLubricationRules.Where(x => x.OwnerId == ownerId && x.BikeId == id)
            .ExecuteDeleteAsync(ct);
        await db
            .PositionExemptions.Where(x => x.OwnerId == ownerId && x.BikeId == id)
            .ExecuteDeleteAsync(ct);

        var referenced =
            await db.Rides.AnyAsync(x => x.OwnerId == ownerId && x.BikeId == id, ct)
            || await db.Installations.AnyAsync(x => x.OwnerId == ownerId && x.BikeId == id, ct);
        if (referenced)
        {
            bike.MarkDeleted(now);
            bike.Version = checked(bike.Version + 1);
        }
        else
        {
            db.Bikes.Remove(bike);
        }
    }
}
