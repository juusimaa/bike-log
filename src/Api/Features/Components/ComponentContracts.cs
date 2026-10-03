using BikeLog.Api.Features.Installations;

namespace BikeLog.Api.Features.Components;

public sealed record CreateComponent(
    [property: System.Text.Json.Serialization.JsonRequired] string? Type,
    [property: System.Text.Json.Serialization.JsonRequired] string? Make,
    [property: System.Text.Json.Serialization.JsonRequired] string? Model
);

public sealed record ComponentResponse(
    Guid Id,
    string Type,
    string Make,
    string Model,
    long Version,
    IReadOnlyList<InstallationResponse> Installations,
    long InitialUsageEstimateMetres
);

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
    long CombinedLifetimeMetres
);
