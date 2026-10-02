using BikeLog.Domain.Bikes;

namespace BikeLog.Domain.Tests;

public class BikeNamingTests
{
    [Fact]
    public void BikeNameFallsBackToMakeModel()
    {
        var bike = new Bike
        {
            Name = "Custom",
            Make = "Canyon",
            Model = "Grizl 7",
        };
        Assert.Equal("Custom", BikeNaming.DisplayName(bike));
        bike.Name = null;
        Assert.Equal("Canyon Grizl 7", BikeNaming.DisplayName(bike));
    }
}
