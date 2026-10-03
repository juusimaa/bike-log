namespace BikeLog.Domain.Components;

public sealed class Component : Entity
{
    public ComponentType Type { get; set; } = ComponentType.Chain;
    public long InitialUsageEstimateMetres { get; set; }
    public string Make { get; set; } = "";
    public string Model { get; set; } = "";
}

public enum ComponentType
{
    Chain,
    Cassette,
    Tyre,
}
