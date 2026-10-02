namespace BikeLog.Domain.Bikes;

public enum BikeKind
{
    Gravel,
    Road,
    Mountain,
    Hybrid,
    Other,
}

public sealed class Bike : Entity
{
    public string? Name { get; set; }
    public string? Make { get; set; }
    public string? Model { get; set; }
    public BikeKind? Kind { get; set; }
    public int? Year { get; set; }
    public string? Color { get; set; }
}
