using BikeLog.Domain.Components;
using BikeLog.Domain.Weights;

namespace BikeLog.Domain.Tests;

public class WeightSummaryTests
{
    private static Component Part(ComponentType type, int? grams) =>
        new() { Type = type, WeightGrams = grams };

    [Fact]
    public void GroupsFrameAndTotalDiscloseMissingWeights()
    {
        var result = WeightSummary.Calculate(
            [
                Part(ComponentType.Saddle, 250),
                Part(ComponentType.Handlebar, 300),
                Part(ComponentType.HandlebarTape, 95),
                Part(ComponentType.Pedals, null),
                Part(ComponentType.Chain, 252),
            ],
            1180
        );
        Assert.Equal(
            [
                new GroupWeight(ComponentGroup.Build, 645, 1),
                new GroupWeight(ComponentGroup.Groupset, 252, 0),
                new GroupWeight(ComponentGroup.Wheels, 0, 0),
            ],
            result.Groups
        );
        Assert.Equal(1180, result.FrameGrams);
        Assert.Equal(645 + 252 + 1180, result.TotalGrams);
        Assert.Equal(1, result.MissingCount);
    }

    [Fact]
    public void MissingFrameWeightCountsAsMissing()
    {
        var result = WeightSummary.Calculate([Part(ComponentType.Tyre, 475)], null);
        Assert.Null(result.FrameGrams);
        Assert.Equal(475, result.TotalGrams);
        Assert.Equal(1, result.MissingCount);
    }

    [Fact]
    public void EmptyBikeWeighsNothing()
    {
        var result = WeightSummary.Calculate([], 1);
        Assert.Equal(ComponentCatalog.Groups.Count, result.Groups.Count);
        Assert.All(result.Groups, g => Assert.Equal(0, g.Grams));
        Assert.Equal(1, result.TotalGrams);
        Assert.Equal(0, result.MissingCount);
    }
}
