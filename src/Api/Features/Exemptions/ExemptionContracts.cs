using System.Text.Json.Serialization;
using BikeLog.Api.Features.Components;
using BikeLog.Domain.Installations;

namespace BikeLog.Api.Features.Exemptions;

public sealed record CreatePositionExemption(
    [property: JsonRequired] string? Position,
    [property: JsonRequired] DateTimeOffset StartUtc,
    long? ExpectedInstallationVersion
);

public sealed record CorrectPositionExemption(
    [property: JsonRequired] DateTimeOffset StartUtc,
    DateTimeOffset? EndUtc,
    [property: JsonRequired] long ExpectedVersion
);

public sealed record PositionExemptionResponse(
    Guid Id,
    Guid BikeId,
    string Position,
    string Reason,
    DateTimeOffset StartUtc,
    DateTimeOffset? EndUtc,
    long Version
)
{
    public static PositionExemptionResponse From(PositionExemption e) =>
        new(
            e.Id,
            e.BikeId,
            ComponentValues.Position(e.Position),
            ComponentValues.Reason(e.Reason),
            e.StartUtc,
            e.EndUtc,
            e.Version
        );
}
