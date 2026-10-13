using BikeLog.Domain.Components;

namespace BikeLog.Api.Features.Components;

public sealed record CatalogPositionResponse(
    string Position,
    string Type,
    string Group,
    string? End,
    string Label,
    string? Exemption
);

public sealed record ComponentCatalogResponse(
    IReadOnlyList<string> Groups,
    IReadOnlyList<CatalogPositionResponse> Positions,
    IReadOnlyList<string> PairTypes
);

public static class CatalogEndpoints
{
    private static readonly ComponentCatalogResponse Catalog = new(
        ComponentCatalog.Groups.Select(ComponentValues.Group).ToArray(),
        ComponentCatalog
            .Entries.Select(x => new CatalogPositionResponse(
                ComponentValues.Position(x.Position),
                ComponentValues.Type(x.Type),
                ComponentValues.Group(x.Group),
                ComponentValues.End(x.End),
                x.Label,
                x.Exemption is { } reason ? ComponentValues.Reason(reason) : null
            ))
            .ToArray(),
        ComponentCatalog.PairTypes.Select(ComponentValues.Type).ToArray()
    );

    public static void MapComponentCatalog(this RouteGroupBuilder api) =>
        api.MapGet("/component-catalog", () => Catalog)
            .Produces<ComponentCatalogResponse>()
            .WithDescription(
                "Fixed positions, component types, groups and labels. Clients render from this and never copy it."
            );
}
