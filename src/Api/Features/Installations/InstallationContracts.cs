using BikeLog.Domain.Installations;
namespace BikeLog.Api.Features.Installations;

public sealed record CreateInstallation([property: System.Text.Json.Serialization.JsonRequired] Guid BikeId, [property: System.Text.Json.Serialization.JsonRequired] Guid ComponentId, [property: System.Text.Json.Serialization.JsonRequired] string? Position, [property: System.Text.Json.Serialization.JsonRequired] DateTimeOffset StartUtc, DateTimeOffset? EndUtc);
public sealed record CorrectInstallation([property: System.Text.Json.Serialization.JsonRequired] DateTimeOffset StartUtc, DateTimeOffset? EndUtc, [property: System.Text.Json.Serialization.JsonRequired] long ExpectedVersion);
public sealed record ReplaceInstallation([property: System.Text.Json.Serialization.JsonRequired] Guid NewComponentId, [property: System.Text.Json.Serialization.JsonRequired] DateTimeOffset ReplacedAtUtc, [property: System.Text.Json.Serialization.JsonRequired] long ExpectedInstallationVersion);
public sealed record InstallationResponse(Guid Id, Guid BikeId, Guid ComponentId, string Position, DateTimeOffset StartUtc, DateTimeOffset? EndUtc, long Version)
{ public static InstallationResponse From(Installation i) => new(i.Id, i.BikeId, i.ComponentId, "chain", i.StartUtc, i.EndUtc, i.Version); }
