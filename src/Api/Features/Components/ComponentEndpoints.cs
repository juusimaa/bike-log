using System.Data;
using BikeLog.Api.Auth;
using BikeLog.Api.Features.Errors;
using BikeLog.Api.Features.Installations;
using BikeLog.Domain.Components;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Components;

public static class ComponentEndpoints
{
    public static void MapComponents(this RouteGroupBuilder api)
    {
        api.MapPost(
                "/components",
                async (
                    CreateComponent request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    var type = ComponentValues.ParseType(request.Type);
                    var weight = ComponentValues.Weight(request.WeightGrams);
                    var c = await mutation.ExecuteAsync(
                        owner.OwnerId,
                        _ =>
                        {
                            var c = new Component
                            {
                                OwnerId = owner.OwnerId,
                                Type = type,
                                Make = ComponentValues.IdentityText(request.Make, "make"),
                                Model = ComponentValues.IdentityText(request.Model, "model"),
                                WeightGrams = weight,
                            };
                            db.Components.Add(c);
                            return Task.FromResult(c);
                        },
                        false,
                        ct
                    );
                    return Results.Created(
                        $"/api/components/{c.Id}",
                        ComponentResponse.From(c, [], [])
                    );
                }
            )
            .Produces<ComponentResponse>(201);
        api.MapPut(
                "/components/{id:guid}",
                async (
                    Guid id,
                    EditComponent request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    var make = ComponentValues.IdentityText(request.Make, "make");
                    var model = ComponentValues.IdentityText(request.Model, "model");
                    var weight = ComponentValues.Weight(request.WeightGrams);
                    var c = await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            var c =
                                await db.Components.SingleOrDefaultAsync(
                                    x => x.OwnerId == owner.OwnerId && x.Id == id,
                                    token
                                ) ?? throw ApiInput.Missing();
                            ApiInput.Version(request.ExpectedVersion, c.Version);
                            c.Make = make;
                            c.Model = model;
                            c.WeightGrams = weight;
                            c.Version = checked(c.Version + 1);
                            return c;
                        },
                        false,
                        ct
                    );
                    return await ComponentReader.ResponseAsync(db, owner.OwnerId, c, ct);
                }
            )
            .Produces<ComponentResponse>()
            .WithDescription(
                "Edit make, model and weight with expectedVersion. Type, installations and usage never change."
            );
        api.MapDelete(
                "/components/{id:guid}",
                async (
                    Guid id,
                    long expectedVersion,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    ICurrentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    await mutation.ExecuteAsync(
                        owner.OwnerId,
                        async token =>
                        {
                            var c =
                                await db
                                    .Components.AsNoTracking()
                                    .SingleOrDefaultAsync(
                                        x => x.OwnerId == owner.OwnerId && x.Id == id,
                                        token
                                    )
                                ?? throw ApiInput.Missing();
                            ApiInput.Version(expectedVersion, c.Version);
                            await ComponentDeletion.DeleteAsync(db, owner.OwnerId, id, token);
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
                "Permanently delete a spare or fitted part with expectedVersion. Its fittings go, leaving gaps; its maintenance records stay unlinked."
            );
        api.MapGet(
            "/components/{id:guid}",
            async (Guid id, BikeLogDbContext db, ICurrentOwner owner, CancellationToken ct) =>
            {
                await using var snapshot = await db.Database.BeginTransactionAsync(
                    IsolationLevel.RepeatableRead,
                    ct
                );
                var c =
                    await db
                        .Components.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct)
                    ?? throw ApiInput.Missing();
                return await ComponentReader.ResponseAsync(db, owner.OwnerId, c, ct);
            }
        );
    }
}
