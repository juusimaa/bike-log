namespace BikeLog.Domain.Installations;

/// <summary>A dated declaration that a bike position is intentionally empty.</summary>
public sealed class PositionExemption : Entity
{
    public Guid BikeId { get; set; }
    public InstallationPosition Position { get; set; } = InstallationPosition.FrontDerailleur;
    public ExemptionReason Reason { get; set; } = ExemptionReason.NoneFitted;
    public DateTimeOffset StartUtc { get; set; }
    public DateTimeOffset? EndUtc { get; set; }
}

public enum ExemptionReason
{
    NoneFitted,
    Tubeless,
}
