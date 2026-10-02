using BikeLog.Domain;
using BikeLog.Domain.Usage;

namespace BikeLog.Domain.Tests;

public class UsageEstimateTests
{
    [Theory]
    [InlineData(65000L, 120000L, 185000L)]
    [InlineData(0L, 0L, 0L)]
    [InlineData(0L, long.MaxValue, long.MaxValue)]
    public void CombinesSeparateNonnegativeMileage(long calculated, long estimate, long expected) =>
        Assert.Equal(expected, UsageEstimate.Combined(calculated, estimate));

    [Theory]
    [InlineData(-1L, 0L)]
    [InlineData(0L, -1L)]
    public void RejectsNegativeMileage(long calculated, long estimate) =>
        Assert.Throws<DomainValidationException>(() =>
            UsageEstimate.Combined(calculated, estimate)
        );

    [Fact]
    public void RejectsCombinedOverflow() =>
        Assert.Throws<OverflowException>(() => UsageEstimate.Combined(1, long.MaxValue));
}
