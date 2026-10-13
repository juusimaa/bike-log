using BikeLog.Domain.Components;

namespace BikeLog.Domain.Weights;

public sealed record GroupWeight(ComponentGroup Group, int Grams, int MissingCount);

/// <summary>
/// Weight of currently fitted parts per catalog group, plus the frame. Totals count recorded
/// weights only; MissingCount discloses parts (and the frame) without one.
/// </summary>
public sealed record WeightSummary(
    IReadOnlyList<GroupWeight> Groups,
    int? FrameGrams,
    int TotalGrams,
    int MissingCount
)
{
    public static WeightSummary Calculate(IEnumerable<Component> fitted, int? frameGrams)
    {
        var parts = fitted.ToArray();
        var groups = ComponentCatalog
            .Groups.Select(group =>
            {
                var inGroup = parts.Where(x => x.Group == group).ToArray();
                return new GroupWeight(
                    group,
                    inGroup.Sum(x => x.WeightGrams ?? 0),
                    inGroup.Count(x => !x.WeightGrams.HasValue)
                );
            })
            .ToArray();
        return new(
            groups,
            frameGrams,
            checked(groups.Sum(x => x.Grams) + (frameGrams ?? 0)),
            groups.Sum(x => x.MissingCount) + (frameGrams.HasValue ? 0 : 1)
        );
    }
}
