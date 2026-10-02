namespace BikeLog.Domain.Maintenance;

public sealed class MaintenanceRecord : Entity
{
    public const string ChainLubricationTaskKey = "chain-lubrication";
    public string? TaskKey { get; set; }
    public Guid BikeId { get; set; }
    public Guid? ComponentId { get; set; }
    public string Task { get; set; } = "";
    public DateTimeOffset PerformedUtc { get; set; }
    public string? Notes { get; set; }
    public decimal? Cost { get; set; }
    public string? Currency { get; set; }
}
