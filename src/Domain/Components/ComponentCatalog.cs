using BikeLog.Domain.Installations;

namespace BikeLog.Domain.Components;

public enum WheelEnd
{
    Front,
    Rear,
}

public sealed record PositionEntry(
    InstallationPosition Position,
    ComponentType Type,
    ComponentGroup Group,
    WheelEnd? End,
    ExemptionReason? Exemption,
    string Label
);

/// <summary>
/// The single source for positions, their component type, group, wheel end, whether they may be
/// intentionally empty, and their display label. Order is the display order.
/// </summary>
public static class ComponentCatalog
{
    private static PositionEntry Build(
        InstallationPosition p,
        ComponentType t,
        string label,
        WheelEnd? end = null
    ) => new(p, t, ComponentGroup.Build, end, null, label);

    private static PositionEntry Groupset(
        InstallationPosition p,
        ComponentType t,
        string label,
        WheelEnd? end = null,
        ExemptionReason? exemption = null
    ) => new(p, t, ComponentGroup.Groupset, end, exemption, label);

    private static PositionEntry Wheels(
        InstallationPosition p,
        ComponentType t,
        string label,
        WheelEnd end,
        ExemptionReason? exemption = null
    ) => new(p, t, ComponentGroup.Wheels, end, exemption, label);

    public static IReadOnlyList<PositionEntry> Entries { get; } =
    [
        Build(InstallationPosition.Fork, ComponentType.Fork, "Fork"),
        Build(InstallationPosition.BottomBracket, ComponentType.BottomBracket, "Bottom bracket"),
        Build(InstallationPosition.Handlebar, ComponentType.Handlebar, "Handlebar"),
        Build(InstallationPosition.HandlebarTape, ComponentType.HandlebarTape, "Handlebar tape"),
        Build(InstallationPosition.Saddle, ComponentType.Saddle, "Saddle"),
        Build(InstallationPosition.Seatpost, ComponentType.Seatpost, "Seatpost"),
        Build(InstallationPosition.Pedals, ComponentType.Pedals, "Pedals"),
        Build(
            InstallationPosition.FrontThroughAxle,
            ComponentType.ThroughAxle,
            "Front through axle",
            WheelEnd.Front
        ),
        Build(
            InstallationPosition.RearThroughAxle,
            ComponentType.ThroughAxle,
            "Rear through axle",
            WheelEnd.Rear
        ),
        Groupset(
            InstallationPosition.FrontDerailleur,
            ComponentType.FrontDerailleur,
            "Front derailleur",
            exemption: ExemptionReason.NoneFitted
        ),
        Groupset(
            InstallationPosition.RearDerailleur,
            ComponentType.RearDerailleur,
            "Rear derailleur"
        ),
        Groupset(InstallationPosition.Shifters, ComponentType.Shifters, "Shifters"),
        Groupset(InstallationPosition.Cassette, ComponentType.Cassette, "Cassette"),
        Groupset(InstallationPosition.Chain, ComponentType.Chain, "Chain"),
        Groupset(
            InstallationPosition.FrontBrake,
            ComponentType.Brake,
            "Front brake",
            WheelEnd.Front
        ),
        Groupset(InstallationPosition.RearBrake, ComponentType.Brake, "Rear brake", WheelEnd.Rear),
        Groupset(
            InstallationPosition.FrontBrakeLever,
            ComponentType.BrakeLever,
            "Front brake lever",
            WheelEnd.Front
        ),
        Groupset(
            InstallationPosition.RearBrakeLever,
            ComponentType.BrakeLever,
            "Rear brake lever",
            WheelEnd.Rear
        ),
        Groupset(InstallationPosition.Crankset, ComponentType.Crankset, "Crankset"),
        Wheels(InstallationPosition.FrontRim, ComponentType.Rim, "Front rim", WheelEnd.Front),
        Wheels(InstallationPosition.RearRim, ComponentType.Rim, "Rear rim", WheelEnd.Rear),
        Wheels(InstallationPosition.FrontTyre, ComponentType.Tyre, "Front tyre", WheelEnd.Front),
        Wheels(InstallationPosition.RearTyre, ComponentType.Tyre, "Rear tyre", WheelEnd.Rear),
        Wheels(
            InstallationPosition.FrontDiscRotor,
            ComponentType.DiscRotor,
            "Front disc rotor",
            WheelEnd.Front
        ),
        Wheels(
            InstallationPosition.RearDiscRotor,
            ComponentType.DiscRotor,
            "Rear disc rotor",
            WheelEnd.Rear
        ),
        Wheels(
            InstallationPosition.FrontInnerTube,
            ComponentType.InnerTube,
            "Front inner tube",
            WheelEnd.Front,
            ExemptionReason.Tubeless
        ),
        Wheels(
            InstallationPosition.RearInnerTube,
            ComponentType.InnerTube,
            "Rear inner tube",
            WheelEnd.Rear,
            ExemptionReason.Tubeless
        ),
    ];

    private static readonly Dictionary<InstallationPosition, PositionEntry> ByPosition =
        Entries.ToDictionary(x => x.Position);

    private static readonly Dictionary<InstallationPosition, int> Order = Entries
        .Select((x, i) => (x.Position, i))
        .ToDictionary(x => x.Position, x => x.i);

    public static IReadOnlyList<ComponentGroup> Groups { get; } =
        Entries.Select(x => x.Group).Distinct().ToArray();

    /// <summary>Types that have both a front and a rear position, in catalog order.</summary>
    public static IReadOnlyList<ComponentType> PairTypes { get; } =
        Entries
            .Where(x => x.End == WheelEnd.Front)
            .Select(x => x.Type)
            .Where(t => Entries.Any(x => x.Type == t && x.End == WheelEnd.Rear))
            .Distinct()
            .ToArray();

    public static PositionEntry Entry(InstallationPosition position) =>
        ByPosition.TryGetValue(position, out var entry)
            ? entry
            : throw new DomainValidationException("Unknown installation position.");

    public static int OrderOf(InstallationPosition position) =>
        Order.TryGetValue(position, out var i) ? i : int.MaxValue;

    public static ComponentGroup GroupOf(ComponentType type) =>
        Entries.FirstOrDefault(x => x.Type == type)?.Group
        ?? throw new DomainValidationException("Unknown component type.");

    public static IReadOnlyList<InstallationPosition> PositionsFor(ComponentType type) =>
        Entries.Where(x => x.Type == type).Select(x => x.Position).ToArray();

    public static (InstallationPosition Front, InstallationPosition Rear) FrontRearPositions(
        ComponentType type
    )
    {
        if (!PairTypes.Contains(type))
        {
            throw new DomainValidationException(
                "Only component types with front and rear positions can be fitted as a pair."
            );
        }
        return (
            Entries.First(x => x.Type == type && x.End == WheelEnd.Front).Position,
            Entries.First(x => x.Type == type && x.End == WheelEnd.Rear).Position
        );
    }
}
