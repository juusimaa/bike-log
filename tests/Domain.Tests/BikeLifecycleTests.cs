using BikeLog.Domain.Bikes;

namespace BikeLog.Domain.Tests;

public class BikeLifecycleTests
{
    private static Bike Canyon(string? name = null) =>
        new()
        {
            Name = name,
            Make = "Canyon",
            Model = "Grail",
            Kind = BikeKind.Gravel,
            Year = 2026,
            Color = "Grey",
            FrameWeightGrams = 1100,
        };

    [Fact]
    public void NewBikeIsActiveAndNotDeleted()
    {
        var bike = Canyon();
        Assert.Equal(BikeStatus.Active, bike.Status);
        Assert.Null(bike.DeletedUtc);
        Assert.False(bike.IsDeleted);
    }

    [Fact]
    public void RetireAndReactivateSwitchStatus()
    {
        var bike = Canyon();
        bike.Retire();
        Assert.Equal(BikeStatus.Retired, bike.Status);
        bike.Reactivate();
        Assert.Equal(BikeStatus.Active, bike.Status);
    }

    [Fact]
    public void DeletionKeepsOnlyTheDisplayName()
    {
        var now = DateTimeOffset.Parse("2026-10-15T08:00:00Z");
        var bike = Canyon();
        bike.MarkDeleted(now);
        Assert.Equal(now, bike.DeletedUtc);
        Assert.True(bike.IsDeleted);
        Assert.Equal("Canyon Grail", bike.Name);
        Assert.Null(bike.Make);
        Assert.Null(bike.Model);
        Assert.Null(bike.Kind);
        Assert.Null(bike.Year);
        Assert.Null(bike.Color);
        Assert.Null(bike.FrameWeightGrams);
        Assert.Equal("Canyon Grail", BikeNaming.DisplayName(bike));
    }

    [Fact]
    public void DeletionKeepsAnOwnerChosenName()
    {
        var bike = Canyon("Winter bike");
        bike.MarkDeleted(DateTimeOffset.Parse("2026-10-15T08:00:00Z"));
        Assert.Equal("Winter bike", bike.Name);
    }

    [Fact]
    public void DeletedBikeCannotChangeState()
    {
        var bike = Canyon();
        bike.MarkDeleted(DateTimeOffset.Parse("2026-10-15T08:00:00Z"));
        Assert.Throws<DomainValidationException>(bike.Retire);
        Assert.Throws<DomainValidationException>(bike.Reactivate);
        Assert.Throws<DomainValidationException>(() =>
            bike.MarkDeleted(DateTimeOffset.Parse("2026-10-16T08:00:00Z"))
        );
    }
}
