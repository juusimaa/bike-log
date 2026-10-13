using System.Text;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;

namespace BikeLog.Api.Features.Components;

/// <summary>Kebab-case wire values for catalog enums. Published values are never renamed.</summary>
public static class ComponentValues
{
    private static readonly WireMap<ComponentType> Types = new("Unknown component type.");
    private static readonly WireMap<InstallationPosition> Positions = new(
        "Unknown installation position."
    );
    private static readonly WireMap<ComponentGroup> Groups = new("Unknown component group.");
    private static readonly WireMap<ExemptionReason> Reasons = new("Unknown exemption reason.");
    private static readonly WireMap<WheelEnd> Ends = new("Unknown wheel end.");

    public static IReadOnlyList<string> TypeValues => Types.Values;
    public static IReadOnlyList<string> PositionValues => Positions.Values;
    public static IReadOnlyList<string> GroupValues => Groups.Values;
    public static IReadOnlyList<string> ReasonValues => Reasons.Values;

    public static string IdentityText(string? value, string field)
    {
        var text = ApiInput.Text(value, field);
        ApiInput.Require(text.Length <= 100, $"{field} must be at most 100 characters.");
        return text;
    }

    public static int? Weight(int? grams)
    {
        ComponentWeight.Validate(grams);
        return grams;
    }

    public static ComponentType ParseType(string? value) => Types.Parse(value);

    public static string Type(ComponentType value) => Types.Wire(value);

    public static InstallationPosition ParsePosition(string? value) => Positions.Parse(value);

    public static string Position(InstallationPosition value) => Positions.Wire(value);

    public static string Group(ComponentGroup value) => Groups.Wire(value);

    public static string Reason(ExemptionReason value) => Reasons.Wire(value);

    public static string? End(WheelEnd? value) => value is { } v ? Ends.Wire(v) : null;

    private sealed class WireMap<TEnum>
        where TEnum : struct, Enum
    {
        private readonly Dictionary<TEnum, string> wire;
        private readonly Dictionary<string, TEnum> parse;
        private readonly string unknown;

        public WireMap(string unknown)
        {
            this.unknown = unknown;
            wire = Enum.GetValues<TEnum>().ToDictionary(x => x, x => Kebab(x.ToString()));
            parse = wire.ToDictionary(x => x.Value, x => x.Key, StringComparer.Ordinal);
            Values = wire.Values.ToArray();
        }

        public IReadOnlyList<string> Values { get; }

        public TEnum Parse(string? value) =>
            value is not null && parse.TryGetValue(value, out var parsed)
                ? parsed
                : throw new DomainValidationException(unknown);

        public string Wire(TEnum value) =>
            wire.TryGetValue(value, out var text)
                ? text
                : throw new DomainValidationException(unknown);

        private static string Kebab(string name)
        {
            var b = new StringBuilder(name.Length + 4);
            for (var i = 0; i < name.Length; i++)
            {
                if (char.IsUpper(name[i]) && i > 0)
                {
                    b.Append('-');
                }
                b.Append(char.ToLowerInvariant(name[i]));
            }
            return b.ToString();
        }
    }
}
