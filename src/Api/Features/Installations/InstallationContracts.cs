using BikeLog.Domain.Installations;
namespace BikeLog.Api.Features.Installations;

public sealed record CreateInstallation(Guid BikeId, Guid ComponentId, string? Position, DateTimeOffset StartUtc, DateTimeOffset? EndUtc);
public sealed record CorrectInstallation(DateTimeOffset StartUtc, DateTimeOffset? EndUtc, long ExpectedVersion);
public sealed record ReplaceInstallation(Guid NewComponentId, DateTimeOffset ReplacedAtUtc, long ExpectedInstallationVersion);
public sealed record InstallationResponse(Guid Id, Guid BikeId, Guid ComponentId, string Position, DateTimeOffset StartUtc, DateTimeOffset? EndUtc, long Version)
{ public static InstallationResponse From(Installation i) => new(i.Id, i.BikeId, i.ComponentId, "chain", i.StartUtc, i.EndUtc, i.Version); }
