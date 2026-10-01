using BikeLog.Domain.Rides;
namespace BikeLog.Api.Features.Rides;

public sealed record CreateRide(Guid BikeId, DateTimeOffset StartUtc, long DistanceMetres, long? DurationSeconds);
public sealed record CorrectRide(Guid BikeId, DateTimeOffset StartUtc, long DistanceMetres, long? DurationSeconds, long ExpectedVersion);
public sealed record RideResponse(Guid Id, Guid BikeId, DateTimeOffset StartUtc, long DistanceMetres, long? DurationSeconds, long Version)
{ public static RideResponse From(Ride r) => new(r.Id, r.BikeId, r.StartUtc, r.DistanceMetres, r.DurationSeconds, r.Version); }
