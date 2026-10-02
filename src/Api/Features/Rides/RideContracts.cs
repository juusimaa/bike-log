using BikeLog.Domain.Rides;

namespace BikeLog.Api.Features.Rides;

public sealed record CreateRide(
    [property: System.Text.Json.Serialization.JsonRequired] Guid BikeId,
    [property: System.Text.Json.Serialization.JsonRequired] DateTimeOffset StartUtc,
    [property: System.Text.Json.Serialization.JsonRequired] long DistanceMetres,
    long? DurationSeconds,
    string? Name = null
);

public sealed record CorrectRide(
    [property: System.Text.Json.Serialization.JsonRequired] Guid BikeId,
    [property: System.Text.Json.Serialization.JsonRequired] DateTimeOffset StartUtc,
    [property: System.Text.Json.Serialization.JsonRequired] long DistanceMetres,
    long? DurationSeconds,
    [property: System.Text.Json.Serialization.JsonRequired] long ExpectedVersion,
    string? Name = null
);

public sealed record RideResponse(
    Guid Id,
    Guid BikeId,
    DateTimeOffset StartUtc,
    long DistanceMetres,
    long? DurationSeconds,
    long Version,
    string? Name = null
)
{
    public static RideResponse From(Ride r) =>
        new(r.Id, r.BikeId, r.StartUtc, r.DistanceMetres, r.DurationSeconds, r.Version, r.Name);
}
