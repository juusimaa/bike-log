using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class PairInstallationTests
{
    private static Task<HttpResponseMessage> Pair(ApiScenario s, Guid bike, string type) =>
        s.Client.PostAsJsonAsync(
            "/api/installations/pair",
            new
            {
                bikeId = bike,
                type,
                make = "Synthetic",
                model = "Pair",
                weightGrams = 140,
                startUtc = ApiScenario.Start,
            }
        );

    [Theory]
    [InlineData("brake", "front-brake", "rear-brake")]
    [InlineData("brake-lever", "front-brake-lever", "rear-brake-lever")]
    [InlineData("disc-rotor", "front-disc-rotor", "rear-disc-rotor")]
    public async Task PairCreatesTwoIndependentParts(string type, string front, string rear)
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var response = await Pair(s, bike, type);
        Assert.Equal(201, (int)response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var f = body.GetProperty("front");
        var r = body.GetProperty("rear");
        Assert.Equal(front, f.GetProperty("installation").GetProperty("position").GetString());
        Assert.Equal(rear, r.GetProperty("installation").GetProperty("position").GetString());
        var frontPart = f.GetProperty("component").GetProperty("id").GetGuid();
        var rearPart = r.GetProperty("component").GetProperty("id").GetGuid();
        Assert.NotEqual(frontPart, rearPart);
        foreach (var part in new[] { f, r })
        {
            var c = part.GetProperty("component");
            Assert.Equal(type, c.GetProperty("type").GetString());
            Assert.Equal("Pair", c.GetProperty("model").GetString());
            Assert.Equal(140, c.GetProperty("weightGrams").GetInt32());
        }
        await s.Ride(bike, ApiScenario.Start.AddHours(1), 40000);
        var replaced = await s.Client.PostAsJsonAsync(
            $"/api/installations/{r.GetProperty("installation").GetProperty("id").GetGuid()}/replacement-with-service",
            new
            {
                newMake = "Synthetic",
                newModel = "Rear only",
                replacedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(200, (int)replaced.StatusCode);
        await s.Ride(bike, ApiScenario.Start.AddDays(2), 10000);
        Assert.Equal(50000, await s.Lifetime(frontPart));
        Assert.Equal(40000, await s.Lifetime(rearPart));
        Assert.Equal(
            JsonValueKind.Null,
            (
                await s.Read(
                    $"/api/installations/{f.GetProperty("installation").GetProperty("id").GetGuid()}"
                )
            )
                .GetProperty("endUtc")
                .ValueKind
        );
    }

    [Fact]
    public async Task SaddleCannotBePaired()
    {
        await using var s = await ApiScenario.Open();
        Assert.Equal(400, (int)(await Pair(s, await s.Bike(), "saddle")).StatusCode);
    }

    [Fact]
    public async Task OccupiedEndSavesNothing()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        await s.Fit(bike, ApiScenario.Id(await s.Part("disc-rotor")), "rear-disc-rotor");
        var components = (await s.Read("/api/components")).GetProperty("items").GetArrayLength();
        var installations = (await s.Read($"/api/bikes/{bike}/installations?status=all"))
            .GetProperty("items")
            .GetArrayLength();
        var response = await Pair(s, bike, "disc-rotor");
        Assert.Equal(409, (int)response.StatusCode);
        Assert.Equal(
            "installation_overlap",
            (await response.Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("code")
                .GetString()
        );
        Assert.Equal(
            components,
            (await s.Read("/api/components")).GetProperty("items").GetArrayLength()
        );
        Assert.Equal(
            installations,
            (await s.Read($"/api/bikes/{bike}/installations?status=all"))
                .GetProperty("items")
                .GetArrayLength()
        );
    }
}
