using System.Data;
using BikeLog.Api.Auth;
using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Api.Features.Installations;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Exemptions;

public static class ExemptionEndpoints
{
    public static void MapPositionExemptions(this RouteGroupBuilder api)
    {
        api.MapPost(
                "/bikes/{id:guid}/position-exemptions",
                async (
                    Guid id,
                    CreatePositionExemption request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    var position = ComponentValues.ParsePosition(request.Position);
                    var reason =
                        ComponentCatalog.Entry(position).Exemption
                        ?? throw new ApiException(
                            400,
                            "invalid_input",
                            "This position cannot be marked as intentionally empty."
                        );
                    var start = request.StartUtc.ToUniversalTime();
                    var exemption = await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            if (
                                !await db.Bikes.AnyAsync(
                                    x => x.OwnerId == owner.OwnerId && x.Id == id,
                                    token
                                )
                            )
                            {
                                throw ApiInput.Missing();
                            }
                            var installations = await db
                                .Installations.Where(x => x.OwnerId == owner.OwnerId)
                                .ToListAsync(token);
                            var open = installations.SingleOrDefault(x =>
                                x.BikeId == id && x.Position == position && x.EndUtc == null
                            );
                            if (open is not null)
                            {
                                // Ending the fitted part needs the version the client last saw.
                                ApiInput.Version(
                                    request.ExpectedInstallationVersion ?? 0,
                                    open.Version
                                );
                                if (open.StartUtc >= start)
                                {
                                    throw new ApiException(
                                        409,
                                        "installation_overlap",
                                        "The fitted part starts on or after this date. Correct its installation first."
                                    );
                                }
                                open.EndUtc = start;
                                open.Version = checked(open.Version + 1);
                            }
                            var e = new PositionExemption
                            {
                                OwnerId = owner.OwnerId,
                                BikeId = id,
                                Position = position,
                                Reason = reason,
                                StartUtc = start,
                            };
                            var exemptions = await db
                                .PositionExemptions.Where(x => x.OwnerId == owner.OwnerId)
                                .ToListAsync(token);
                            exemptions.Add(e);
                            await InstallationEndpoints.ValidateHistory(
                                installations,
                                db,
                                owner.OwnerId,
                                token,
                                exemptions
                            );
                            db.PositionExemptions.Add(e);
                            return e;
                        },
                        true,
                        ct
                    );
                    return Results.Created(
                        $"/api/position-exemptions/{exemption.Id}",
                        PositionExemptionResponse.From(exemption)
                    );
                }
            )
            .Produces<PositionExemptionResponse>(201)
            .WithDescription(
                "Declare a position intentionally empty from startUtc (front derailleur none fitted, or a tubeless wheel). Any open part there is ended at startUtc and needs expectedInstallationVersion."
            );
        api.MapPut(
                "/position-exemptions/{id:guid}",
                async (
                    Guid id,
                    CorrectPositionExemption request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                    PositionExemptionResponse.From(
                        await mutation.ExecuteAsync(
                            owner.OwnerId,
                            async token =>
                            {
                                var exemptions = await db
                                    .PositionExemptions.Where(x => x.OwnerId == owner.OwnerId)
                                    .ToListAsync(token);
                                var e =
                                    exemptions.SingleOrDefault(x => x.Id == id)
                                    ?? throw ApiInput.Missing();
                                ApiInput.Version(request.ExpectedVersion, e.Version);
                                e.StartUtc = request.StartUtc.ToUniversalTime();
                                e.EndUtc = request.EndUtc?.ToUniversalTime();
                                e.Version = checked(e.Version + 1);
                                await InstallationEndpoints.ValidateHistory(
                                    await db
                                        .Installations.Where(x => x.OwnerId == owner.OwnerId)
                                        .ToListAsync(token),
                                    db,
                                    owner.OwnerId,
                                    token,
                                    exemptions
                                );
                                return e;
                            },
                            true,
                            ct
                        )
                    )
            )
            .Produces<PositionExemptionResponse>()
            .WithDescription(
                "Correct or end an exemption with expectedVersion. Ending it means the position needs a part again."
            );
        api.MapGet(
                "/bikes/{id:guid}/position-exemptions",
                async (Guid id, BikeLogDbContext db, ICurrentOwner owner, CancellationToken ct) =>
                {
                    await using var snapshot = await db.Database.BeginTransactionAsync(
                        IsolationLevel.RepeatableRead,
                        ct
                    );
                    if (!await db.Bikes.AnyAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct))
                    {
                        throw ApiInput.Missing();
                    }
                    return (
                        await db
                            .PositionExemptions.AsNoTracking()
                            .Where(x => x.OwnerId == owner.OwnerId && x.BikeId == id)
                            .OrderByDescending(x => x.StartUtc)
                            .ThenByDescending(x => x.Id)
                            .ToListAsync(ct)
                    )
                        .Select(PositionExemptionResponse.From)
                        .ToArray();
                }
            )
            .Produces<PositionExemptionResponse[]>()
            .WithDescription("The bike's intentionally empty periods, newest first.");
    }
}
