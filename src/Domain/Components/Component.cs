namespace BikeLog.Domain.Components;
public sealed class Component : Entity { public ComponentType Type { get; set; } = ComponentType.Chain; public string Model { get; set; } = ""; }

public enum ComponentType { Chain }
