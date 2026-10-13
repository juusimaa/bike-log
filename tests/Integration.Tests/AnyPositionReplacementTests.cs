using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class AnyPositionReplacementTests
{
    [Theory]
    [InlineData("handlebar-tape", "handlebar-tape", "Replace handlebar tape")]
    [InlineData("rear-derailleur", "rear-derailleur", "Replace rear derailleur")]
    [InlineData("tyre", "rear-tyre", "Replace rear tyre")]
    public async Task ReplacementWithServiceWorksInEveryGroup(
        string type,
        string position,
        string task
    )
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var old = ApiScenario.Id(await s.Part(type));
        var fitted = ApiScenario.Id(await s.Fit(bike, old, position));
        var other = ApiScenario.Id(await s.Part("saddle"));
        await s.Fit(bike, other, "saddle");
        await s.Ride(bike, ApiScenario.Start.AddHours(1), 40000);
        var response = await s.Client.PostAsJsonAsync(
            $"/api/installations/{fitted}/replacement-with-service",
            new
            {
                newMake = "Synthetic",
                newModel = "Next",
                newWeightGrams = 310,
                replacedAtUtc = ApiScenario.Start.AddDays(2),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(200, (int)response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(task, body.GetProperty("maintenance").GetProperty("task").GetString());
        Assert.Equal(310, body.GetProperty("component").GetProperty("weightGrams").GetInt32());
        Assert.False(
            string.IsNullOrEmpty(body.GetProperty("component").GetProperty("group").GetString())
        );
        var next = body.GetProperty("component").GetProperty("id").GetGuid();
        await s.Ride(bike, ApiScenario.Start.AddDays(3), 25000);
        Assert.Equal(40000, await s.Lifetime(old));
        Assert.Equal(25000, await s.Lifetime(next));
        Assert.Equal(65000, await s.Lifetime(other));
    }

    [Fact]
    public async Task ReplacingWithASpareKeepsTheRemovedPartAndItsUsage()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var saddle = ApiScenario.Id(await s.Part("saddle"));
        var fitted = ApiScenario.Id(await s.Fit(bike, saddle, "saddle"));
        await s.Ride(bike, ApiScenario.Start.AddHours(1), 40000);
        var pedals = ApiScenario.Id(await s.Part("pedals"));
        var wrongType = await s.Client.PostAsJsonAsync(
            $"/api/installations/{fitted}/replacement",
            new
            {
                newComponentId = pedals,
                replacedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(400, (int)wrongType.StatusCode);
        var otherBike = await s.Bike("Other");
        var elsewhere = ApiScenario.Id(await s.Part("saddle"));
        await s.Fit(otherBike, elsewhere, "saddle");
        var busy = await s.Client.PostAsJsonAsync(
            $"/api/installations/{fitted}/replacement",
            new
            {
                newComponentId = elsewhere,
                replacedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(409, (int)busy.StatusCode);
        Assert.Equal(
            "installation_overlap",
            (await busy.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()
        );
        var spare = ApiScenario.Id(await s.Part("saddle"));
        var replaced = await s.Client.PostAsJsonAsync(
            $"/api/installations/{fitted}/replacement",
            new
            {
                newComponentId = spare,
                replacedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(200, (int)replaced.StatusCode);
        await s.Ride(bike, ApiScenario.Start.AddDays(2), 10000);
        Assert.Equal(40000, await s.Lifetime(saddle));
        Assert.Equal(10000, await s.Lifetime(spare));
        var removed = await s.Read($"/api/components/{saddle}");
        Assert.All(
            removed.GetProperty("installations").EnumerateArray(),
            x => Assert.NotEqual(JsonValueKind.Null, x.GetProperty("endUtc").ValueKind)
        );
    }
}
