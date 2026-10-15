using BikeLog.Api.Auth;
using BikeLog.Api.Features.Bikes;
using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Installations;

public static class PairEndpoints
{
    public static void MapFitPair(this RouteGroupBuilder api) =>
        api.MapPost(
                "/installations/pair",
                async (
                    FitPair request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    var type = ComponentValues.ParseType(request.Type);
                    var (frontPosition, rearPosition) = ComponentCatalog.FrontRearPositions(type);
                    var make = ComponentValues.IdentityText(request.Make, "make");
                    var model = ComponentValues.IdentityText(request.Model, "model");
                    var weight = ComponentValues.Weight(request.WeightGrams);
                    var estimate = request.InitialUsageEstimateMetres ?? 0;
                    ApiInput.Require(estimate >= 0, "Usage values must be nonnegative.");
                    var start = request.StartUtc.ToUniversalTime();
                    var result = await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            var bike = await BikeGuards.RequireActiveAsync(
                                db,
                                owner.OwnerId,
                                request.BikeId,
                                token
                            );
                            (Component, Installation) Part(InstallationPosition position)
                            {
                                var c = new Component
                                {
                                    OwnerId = owner.OwnerId,
                                    Type = type,
                                    Make = make,
                                    Model = model,
                                    WeightGrams = weight,
                                    InitialUsageEstimateMetres = estimate,
                                };
                                return (
                                    c,
                                    new Installation
                                    {
                                        OwnerId = owner.OwnerId,
                                        BikeId = request.BikeId,
                                        ComponentId = c.Id,
                                        Position = position,
                                        StartUtc = start,
                                    }
                                );
                            }
                            var front = Part(frontPosition);
                            var rear = Part(rearPosition);
                            var all = await db
                                .Installations.Where(x => x.OwnerId == owner.OwnerId)
                                .ToListAsync(token);
                            all.Add(front.Item2);
                            all.Add(rear.Item2);
                            // Validate both ends before adding either, so nothing is saved on a conflict.
                            await InstallationEndpoints.ValidateHistory(
                                all,
                                db,
                                owner.OwnerId,
                                token
                            );
                            db.Components.AddRange(front.Item1, rear.Item1);
                            db.Installations.AddRange(front.Item2, rear.Item2);
                            return new FitPairResponse(Fitted(front, bike), Fitted(rear, bike));
                        },
                        true,
                        ct
                    );
                    return Results.Created(
                        $"/api/installations/{result.Front.Installation.Id}",
                        result
                    );
                }
            )
            .Produces<FitPairResponse>(201)
            .WithDescription(
                "Create two parts of one front/rear type and fit them to both ends from startUtc, all or nothing."
            );

    private static FittedPart Fitted(
        (Component Component, Installation Installation) part,
        Bike bike
    )
    {
        var installation = InstallationResponse.From(part.Installation);
        return new(
            ComponentResponse.From(part.Component, [installation], [BikeRef.From(bike)]),
            installation
        );
    }
}
