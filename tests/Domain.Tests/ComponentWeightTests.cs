using BikeLog.Domain.Components;

namespace BikeLog.Domain.Tests;

public class ComponentWeightTests
{
    [Theory]
    [InlineData(null)]
    [InlineData(1)]
    [InlineData(20000)]
    public void AcceptsUnrecordedAndPlausibleWeights(int? grams) => ComponentWeight.Validate(grams);

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(20001)]
    public void RejectsImplausibleWeights(int grams) =>
        Assert.Throws<DomainValidationException>(() => ComponentWeight.Validate(grams));
}
