using BikeLog.Api.Development;
using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Api.Features.Maintenance;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Maintenance;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Installations;

public static class ReplacementEndpoints
{
    public static void MapReplacementWithService(this RouteGroupBuilder api)
    {
        api.MapPost(
                "/installations/{id:guid}/replacement-with-service",
                async (
                    Guid id,
                    ReplaceWithService request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    IDevelopmentOwner owner,
                    CancellationToken ct
                ) =>
                    await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            var old =
                                await db.Installations.SingleOrDefaultAsync(
                                    x => x.OwnerId == owner.OwnerId && x.Id == id,
                                    token
                                ) ?? throw ApiInput.Missing();
                            ApiInput.Version(request.ExpectedInstallationVersion, old.Version);
                            var make = ComponentValues.IdentityText(request.NewMake, "newMake");
                            var model = ComponentValues.IdentityText(request.NewModel, "newModel");
                            MaintenanceInput.ValidateCost(request.Cost, request.Currency);
                            var at = request.ReplacedAtUtc.ToUniversalTime();
                            ApiInput.Require(
                                old.EndUtc == null && at > old.StartUtc,
                                "Replacement requires an open interval and a later instant."
                            );
                            var previous =
                                await db.Components.SingleOrDefaultAsync(
                                    x => x.OwnerId == owner.OwnerId && x.Id == old.ComponentId,
                                    token
                                ) ?? throw ApiInput.Missing();
                            ComponentCompatibility.Validate(previous.Type, old.Position);
                            var component = new Component
                            {
                                OwnerId = owner.OwnerId,
                                Type = previous.Type,
                                Make = make,
                                Model = model,
                            };
                            old.EndUtc = at;
                            old.Version = checked(old.Version + 1);
                            var next = new Installation
                            {
                                OwnerId = owner.OwnerId,
                                BikeId = old.BikeId,
                                ComponentId = component.Id,
                                Position = old.Position,
                                StartUtc = at,
                            };
                            var all = await db
                                .Installations.Where(x => x.OwnerId == owner.OwnerId)
                                .ToListAsync(token);
                            all.Add(next);
                            await InstallationEndpoints.ValidateHistory(
                                all,
                                db,
                                owner.OwnerId,
                                token
                            );
                            var maintenance = new MaintenanceRecord
                            {
                                OwnerId = owner.OwnerId,
                                BikeId = old.BikeId,
                                ComponentId = component.Id,
                                Task = old.Position switch
                                {
                                    InstallationPosition.Chain => "Replace chain",
                                    InstallationPosition.Cassette => "Replace cassette",
                                    InstallationPosition.FrontTyre => "Replace front tyre",
                                    InstallationPosition.RearTyre => "Replace rear tyre",
                                    _ => throw new InvalidOperationException("Unknown position."),
                                },
                                PerformedUtc = at,
                                Cost = request.Cost,
                                Currency = request.Currency,
                            };
                            db.Components.Add(component);
                            db.Installations.Add(next);
                            db.MaintenanceRecords.Add(maintenance);
                            var nextResponse = InstallationResponse.From(next);
                            return new ReplacementWithServiceResponse(
                                new ComponentResponse(
                                    component.Id,
                                    ComponentValues.Type(component.Type),
                                    component.Make,
                                    component.Model,
                                    component.Version,
                                    [nextResponse],
                                    component.InitialUsageEstimateMetres
                                ),
                                InstallationResponse.From(old),
                                nextResponse,
                                MaintenanceResponse.From(maintenance)
                            );
                        },
                        true,
                        ct
                    )
            )
            .Produces<ReplacementWithServiceResponse>(200);
    }
}
