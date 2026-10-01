namespace BikeLog.Api.Features.Bikes;
public sealed record CreateBike(string? Name);
public sealed record BikeResponse(Guid Id,string Name,long Version);
