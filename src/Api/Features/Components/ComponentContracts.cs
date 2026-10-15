using BikeLog.Api.Features.Bikes;
using BikeLog.Api.Features.Installations;
using BikeLog.Domain.Components;

namespace BikeLog.Api.Features.Components;

public sealed record CreateComponent(
    [property: System.Text.Json.Serialization.JsonRequired] string? Type,
    [property: System.Text.Json.Serialization.JsonRequired] string? Make,
    [property: System.Text.Json.Serialization.JsonRequired] string? Model,
    int? WeightGrams
);

public sealed record EditComponent(
    [property: System.Text.Json.Serialization.JsonRequired] string? Make,
    [property: System.Text.Json.Serialization.JsonRequired] string? Model,
    int? WeightGrams,
    [property: System.Text.Json.Serialization.JsonRequired] long ExpectedVersion
);

public sealed record ComponentResponse(
    Guid Id,
    string Type,
    string Make,
    string Model,
    long Version,
    IReadOnlyList<InstallationResponse> Installations,
    long InitialUsageEstimateMetres,
    string Group,
    int? WeightGrams,
    IReadOnlyList<BikeRef> Bikes
)
{
    /// <param name="bikes">One entry per bike its installations reference, deleted bikes included.</param>
    public static ComponentResponse From(
        Component c,
        IReadOnlyList<InstallationResponse> installations,
        IReadOnlyList<BikeRef> bikes
    ) =>
        new(
            c.Id,
            ComponentValues.Type(c.Type),
            c.Make,
            c.Model,
            c.Version,
            installations,
            c.InitialUsageEstimateMetres,
            ComponentValues.Group(c.Group),
            c.WeightGrams,
            bikes
        );
}

public sealed record EditComponentEstimate(
    [property: System.Text.Json.Serialization.JsonRequired] long InitialUsageEstimateMetres,
    [property: System.Text.Json.Serialization.JsonRequired] long ExpectedVersion
);

public sealed record ComponentEstimateResponse(
    Guid Id,
    string Type,
    string Make,
    string Model,
    long Version,
    long CalculatedLifetimeMetres,
    long InitialUsageEstimateMetres,
    long CombinedLifetimeMetres,
    string Group,
    int? WeightGrams
);
