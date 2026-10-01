namespace BikeLog.Api.Features.Bikes;

public sealed record CreateBike([property: System.Text.Json.Serialization.JsonRequired] string? Name);
public sealed record BikeResponse(Guid Id, string Name, long Version);
