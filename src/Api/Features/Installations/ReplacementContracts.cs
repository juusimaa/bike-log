using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Maintenance;

namespace BikeLog.Api.Features.Installations;

public sealed record ReplaceWithService(
    [property: System.Text.Json.Serialization.JsonRequired] string? NewMake,
    [property: System.Text.Json.Serialization.JsonRequired] string? NewModel,
    [property: System.Text.Json.Serialization.JsonRequired] DateTimeOffset ReplacedAtUtc,
    [property: System.Text.Json.Serialization.JsonRequired] long ExpectedInstallationVersion,
    decimal? Cost,
    string? Currency
);

public sealed record ReplacementWithServiceResponse(
    ComponentResponse Component,
    InstallationResponse OldInstallation,
    InstallationResponse NewInstallation,
    MaintenanceResponse Maintenance
);
