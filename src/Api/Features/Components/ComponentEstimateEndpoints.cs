using BikeLog.Api.Auth;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Usage;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Components;

public static class ComponentEstimateEndpoints
{
    public static void MapComponentEstimates(this RouteGroupBuilder api)
    {
        api.MapPut(
                "/components/{id:guid}/estimate",
                async (
                    Guid id,
                    EditComponentEstimate request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                    await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            var component =
                                await db.Components.SingleOrDefaultAsync(
                                    x => x.OwnerId == owner.OwnerId && x.Id == id,
                                    token
                                ) ?? throw ApiInput.Missing();
                            ApiInput.Version(request.ExpectedVersion, component.Version);
                            var calculated =
                                await db
                                    .ComponentUsages.AsNoTracking()
                                    .Where(x => x.OwnerId == owner.OwnerId && x.ComponentId == id)
                                    .Select(x => (long?)x.LifetimeMetres)
                                    .SingleOrDefaultAsync(token)
                                ?? 0;
                            var combined = UsageEstimate.Combined(
                                calculated,
                                request.InitialUsageEstimateMetres
                            );
                            component.InitialUsageEstimateMetres =
                                request.InitialUsageEstimateMetres;
                            component.Version = checked(component.Version + 1);
                            return new ComponentEstimateResponse(
                                component.Id,
                                ComponentValues.Type(component.Type),
                                component.Make,
                                component.Model,
                                component.Version,
                                calculated,
                                component.InitialUsageEstimateMetres,
                                combined
                            );
                        },
                        false,
                        ct
                    )
            )
            .Produces<ComponentEstimateResponse>();
    }
}
