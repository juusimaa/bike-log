namespace BikeLog.Infrastructure.Persistence;

public sealed class ComponentUsageRow
{
    public Guid ComponentId
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public long LifetimeMetres
    {
        get; set;
    }
    public long LifetimeSeconds
    {
        get; set;
    }
    public bool HasUnknownDuration
    {
        get; set;
    }
    public DateTimeOffset CalculatedAtUtc
    {
        get; set;
    }
}
public sealed class InstallationUsageRow
{
    public Guid InstallationId
    {
        get; set;
    }
    public Guid OwnerId
    {
        get; set;
    }
    public long Metres
    {
        get; set;
    }
    public long Seconds
    {
        get; set;
    }
    public bool HasUnknownDuration
    {
        get; set;
    }
    public DateTimeOffset CalculatedAtUtc
    {
        get; set;
    }
}
