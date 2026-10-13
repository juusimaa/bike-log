using System.Text.Json.Serialization;
using BikeLog.Api.Features.Components;

namespace BikeLog.Api.Features.Installations;

public sealed record FitPair(
    [property: JsonRequired] Guid BikeId,
    [property: JsonRequired] string? Type,
    [property: JsonRequired] string? Make,
    [property: JsonRequired] string? Model,
    int? WeightGrams,
    [property: JsonRequired] DateTimeOffset StartUtc,
    long? InitialUsageEstimateMetres
);

public sealed record FittedPart(ComponentResponse Component, InstallationResponse Installation);

public sealed record FitPairResponse(FittedPart Front, FittedPart Rear);
