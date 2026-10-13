namespace BikeLog.Domain.Components;

public sealed class Component : Entity
{
    public ComponentType Type { get; set; } = ComponentType.Chain;
    public long InitialUsageEstimateMetres { get; set; }
    public string Make { get; set; } = "";
    public string Model { get; set; } = "";
    public int? WeightGrams { get; set; }
    public ComponentGroup Group => ComponentCatalog.GroupOf(Type);
}

public enum ComponentType
{
    Fork,
    BottomBracket,
    Handlebar,
    HandlebarTape,
    Saddle,
    Seatpost,
    Pedals,
    ThroughAxle,
    FrontDerailleur,
    RearDerailleur,
    Shifters,
    Cassette,
    Chain,
    Brake,
    BrakeLever,
    Crankset,
    Rim,
    Tyre,
    DiscRotor,
    InnerTube,
}

public enum ComponentGroup
{
    Build,
    Groupset,
    Wheels,
}
