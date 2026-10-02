namespace BikeLog.Domain.Rides;

public sealed class Ride : Entity
{
    public string? Name { get; set; }
    public Guid BikeId { get; set; }
    public DateTimeOffset StartUtc { get; set; }
    public long DistanceMetres { get; set; }
    public long? DurationSeconds { get; set; }
}
