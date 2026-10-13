using BikeLog.Api.Auth;
using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Installations;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Installations;

public static class MoveEndpoints
{
    public static void MapMoveInstallation(this RouteGroupBuilder api) =>
        api.MapPost(
                "/installations/{id:guid}/move",
                async (
                    Guid id,
                    MoveInstallation request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    InstallationPosition? requested = request.ToPosition is null
                        ? null
                        : ComponentValues.ParsePosition(request.ToPosition);
                    var at = request.MovedAtUtc.ToUniversalTime();
                    return await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            var all = await db
                                .Installations.Where(x => x.OwnerId == owner.OwnerId)
                                .ToListAsync(token);
                            var old =
                                all.SingleOrDefault(x => x.Id == id) ?? throw ApiInput.Missing();
                            ApiInput.Version(request.ExpectedInstallationVersion, old.Version);
                            if (
                                !await db.Bikes.AnyAsync(
                                    x => x.OwnerId == owner.OwnerId && x.Id == request.ToBikeId,
                                    token
                                )
                            )
                            {
                                throw ApiInput.Missing();
                            }
                            var position = requested ?? old.Position;
                            var component = await db.Components.SingleAsync(
                                x => x.OwnerId == owner.OwnerId && x.Id == old.ComponentId,
                                token
                            );
                            ComponentCompatibility.Validate(component.Type, position);
                            ApiInput.Require(
                                old.EndUtc == null
                                    && at > old.StartUtc
                                    && (old.BikeId != request.ToBikeId || old.Position != position),
                                "A move needs a fitted part, a later instant and a different place."
                            );
                            // Taking the place of a fitted part needs the version the client last saw.
                            var displaced = all.SingleOrDefault(x =>
                                x.BikeId == request.ToBikeId
                                && x.Position == position
                                && x.EndUtc == null
                            );
                            if (displaced is not null)
                            {
                                ApiInput.Version(
                                    request.ExpectedDestinationInstallationVersion ?? 0,
                                    displaced.Version
                                );
                                if (displaced.StartUtc >= at)
                                {
                                    throw new ApiException(
                                        409,
                                        "installation_overlap",
                                        "The part in that position was fitted on or after this date."
                                    );
                                }
                                displaced.EndUtc = at;
                                displaced.Version = checked(displaced.Version + 1);
                            }
                            old.EndUtc = at;
                            old.Version = checked(old.Version + 1);
                            var next = new Installation
                            {
                                OwnerId = owner.OwnerId,
                                BikeId = request.ToBikeId,
                                ComponentId = old.ComponentId,
                                Position = position,
                                StartUtc = at,
                            };
                            all.Add(next);
                            await InstallationEndpoints.ValidateHistory(
                                all,
                                db,
                                owner.OwnerId,
                                token
                            );
                            db.Installations.Add(next);
                            return new MoveInstallationResponse(
                                InstallationResponse.From(old),
                                InstallationResponse.From(next),
                                displaced is null ? null : InstallationResponse.From(displaced)
                            );
                        },
                        true,
                        ct
                    );
                }
            )
            .Produces<MoveInstallationResponse>()
            .WithDescription(
                "Move a fitted part to another bike or position in one step. An occupied destination needs expectedDestinationInstallationVersion; its part returns to the garage."
            );
}
