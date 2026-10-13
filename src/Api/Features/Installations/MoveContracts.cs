using System.Text.Json.Serialization;

namespace BikeLog.Api.Features.Installations;

public sealed record MoveInstallation(
    [property: JsonRequired] Guid ToBikeId,
    string? ToPosition,
    [property: JsonRequired] DateTimeOffset MovedAtUtc,
    [property: JsonRequired] long ExpectedInstallationVersion,
    long? ExpectedDestinationInstallationVersion
);

public sealed record MoveInstallationResponse(
    InstallationResponse OldInstallation,
    InstallationResponse NewInstallation,
    InstallationResponse? DisplacedInstallation
);
