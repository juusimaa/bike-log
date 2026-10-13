using System.Net.Http.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class ComponentMetadataTests
{
    [Theory]
    [InlineData("chain")]
    [InlineData("cassette")]
    [InlineData("tyre")]
    public async Task MakeAndModelRoundTrip(string type)
    {
        await using var s = await ApiScenario.Open();
        var part = await s.Create(
            "/api/components",
            new
            {
                type,
                make = " Campagnolo ",
                model = " Ekar C13 C-Link 13-speed ",
            }
        );
        var id = ApiScenario.Id(part);
        foreach (var response in new[] { part, await s.Read($"/api/components/{id}") })
        {
            Assert.Equal("Campagnolo", response.GetProperty("make").GetString());
            Assert.Equal("Ekar C13 C-Link 13-speed", response.GetProperty("model").GetString());
        }
        var collection = await s.Read("/api/components");
        Assert.Equal(
            "Campagnolo",
            collection.GetProperty("items")[0].GetProperty("make").GetString()
        );
    }

    [Fact]
    public async Task MakeIsRequiredAndBounded()
    {
        await using var s = await ApiScenario.Open();
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.PostAsJsonAsync(
                        "/api/components",
                        new { type = "chain", model = "Ekar" }
                    )
                ).StatusCode
        );
        foreach (var make in new[] { null, "", "  ", new string('x', 101) })
        {
            Assert.Equal(
                400,
                (int)
                    (
                        await s.Client.PostAsJsonAsync(
                            "/api/components",
                            new
                            {
                                type = "chain",
                                make,
                                model = "Ekar",
                            }
                        )
                    ).StatusCode
            );
        }
    }

    [Fact]
    public async Task DetailsEditSetsWeightWithoutTouchingHistory()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await s.Ride(e.Bike, ApiScenario.Start.AddHours(1), 65000);
        var estimate = await s.Client.PutAsJsonAsync(
            $"/api/components/{e.Chain}/estimate",
            new { initialUsageEstimateMetres = 5000, expectedVersion = 1 }
        );
        Assert.Equal(200, (int)estimate.StatusCode);
        var before = await s.Read($"/api/components/{e.Chain}/usage");
        var edited = await s.Client.PutAsJsonAsync(
            $"/api/components/{e.Chain}",
            new
            {
                make = "Synthetic",
                model = "Renamed",
                weightGrams = 9,
                expectedVersion = 2,
            }
        );
        Assert.Equal(200, (int)edited.StatusCode);
        var body = await edited.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(9, body.GetProperty("weightGrams").GetInt32());
        Assert.Equal("Renamed", body.GetProperty("model").GetString());
        Assert.Equal("chain", body.GetProperty("type").GetString());
        Assert.Equal(3, body.GetProperty("version").GetInt64());
        Assert.Equal(1, body.GetProperty("installations").GetArrayLength());
        Assert.Equal(5000, body.GetProperty("initialUsageEstimateMetres").GetInt64());
        var after = await s.Read($"/api/components/{e.Chain}/usage");
        Assert.Equal(
            before.GetProperty("combinedLifetimeMetres").GetInt64(),
            after.GetProperty("combinedLifetimeMetres").GetInt64()
        );
        Assert.Equal(
            before.GetProperty("installations")[0].GetProperty("metres").GetInt64(),
            after.GetProperty("installations")[0].GetProperty("metres").GetInt64()
        );
        var stale = await s.Client.PutAsJsonAsync(
            $"/api/components/{e.Chain}",
            new
            {
                make = "Synthetic",
                model = "Stale",
                weightGrams = 10,
                expectedVersion = 2,
            }
        );
        Assert.Equal(409, (int)stale.StatusCode);
        var invalid = await s.Client.PutAsJsonAsync(
            $"/api/components/{e.Chain}",
            new
            {
                make = "Synthetic",
                model = "Heavy",
                weightGrams = 20001,
                expectedVersion = 3,
            }
        );
        Assert.Equal(400, (int)invalid.StatusCode);
    }
}
