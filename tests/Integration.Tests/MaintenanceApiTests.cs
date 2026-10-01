using System.Net.Http.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class MaintenanceApiTests
{
    [Fact]
    public async Task MaintenanceRetainsOptionalCostAndDoesNotResetUsage()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = e.Bike,
                componentId = e.Chain,
                task = "Lubrication",
                performedUtc = ApiScenario.Start.AddHours(1),
                notes = "Synthetic note",
                cost = 5.50m,
                currency = "EUR",
            }
        );
        var records = await s.Read($"/api/bikes/{e.Bike}/maintenance");
        Assert.Equal(5.50m, records[0].GetProperty("cost").GetDecimal());
        Assert.Equal("Synthetic note", records[0].GetProperty("notes").GetString());
        await using var db = TestDatabase.Open(s.ConnectionString);
        Assert.Equal(0, db.ComponentUsages.Single(x => x.ComponentId == e.Chain).LifetimeMetres);
    }

    [Theory]
    [InlineData(-1, "EUR")]
    [InlineData(1, null)]
    [InlineData(1, "eur")]
    [InlineData(1.234, "EUR")]
    public async Task InvalidCostCurrencyPairReturns400(double cost, string? currency)
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var r = await s.Client.PostAsJsonAsync(
            "/api/maintenance",
            new
            {
                bikeId = e.Bike,
                task = "Lubrication",
                performedUtc = ApiScenario.Start,
                cost,
                currency,
            }
        );
        Assert.Equal(400, (int)r.StatusCode);
    }

    [Fact]
    public async Task ComponentMaintenanceRequiresDatedBikeAssociation()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var r = await s.Client.PostAsJsonAsync(
            "/api/maintenance",
            new
            {
                bikeId = e.Bike,
                componentId = e.Chain,
                task = "Inspect",
                performedUtc = ApiScenario.Start.AddDays(-1),
            }
        );
        Assert.Equal(400, (int)r.StatusCode);
    }
}
