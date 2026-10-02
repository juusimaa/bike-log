using System.Data;
using BikeLog.Api.Development;
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
                    IDevelopmentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    var type = ComponentValues.ParseType(request.Type);
                    var c = await mutation.ExecuteAsync(
                        owner.OwnerId,
                        _ =>
                        {
                            var c = new Component
                            {
                                OwnerId = owner.OwnerId,
                                Type = type,
                                Model = ApiInput.Text(request.Model, "model"),
                            };
                            db.Components.Add(c);
                            return Task.FromResult(c);
                        },
                        false,
                        ct
                    );
                    return Results.Created(
                        $"/api/components/{c.Id}",
                        new ComponentResponse(
                            c.Id,
                            ComponentValues.Type(c.Type),
                            c.Model,
                            c.Version,
                            [],
                            c.InitialUsageEstimateMetres
                        )
                    );
                }
            )
            .Produces<ComponentResponse>(201);
        api.MapGet(
            "/components/{id:guid}",
            async (Guid id, BikeLogDbContext db, IDevelopmentOwner owner, CancellationToken ct) =>
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
                var history = await db
                    .Installations.AsNoTracking()
                    .Where(x => x.OwnerId == owner.OwnerId && x.ComponentId == id)
                    .OrderBy(x => x.StartUtc)
                    .ToListAsync(ct);
                return new ComponentResponse(
                    c.Id,
                    ComponentValues.Type(c.Type),
                    c.Model,
                    c.Version,
                    history.Select(InstallationResponse.From).ToArray(),
                    c.InitialUsageEstimateMetres
                );
            }
        );
    }
}
