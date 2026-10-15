using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class BikeStatusTests
{
    private static Task<HttpResponseMessage> SetStatus(
        ApiScenario s,
        Guid bike,
        string status,
        long version
    ) =>
        s.Client.PutAsJsonAsync(
            $"/api/bikes/{bike}/status",
            new { status, expectedVersion = version }
        );

    /// <summary>Overview without its evaluation instant, which changes on every read.</summary>
    private static async Task<string> Overview(ApiScenario s, Guid bike)
    {
        var o = (await s.Read($"/api/bikes/{bike}/overview")).Clone();
        var copy = JsonSerializer.SerializeToNode(o)!.AsObject();
        copy.Remove("evaluatedAtUtc");
        copy.Remove("bike");
        copy["reminder"]!.AsObject().Remove("evaluatedAtUtc");
        return copy.ToJsonString();
    }

    [Fact]
    public async Task RetireAndReactivateUseTheVersion()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var retired = await SetStatus(s, bike, "retired", 1);
        Assert.Equal(200, (int)retired.StatusCode);
        var body = await retired.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("retired", body.GetProperty("status").GetString());
        Assert.Equal(2, body.GetProperty("version").GetInt64());
        Assert.Equal(
            "retired",
            (await s.Read($"/api/bikes/{bike}")).GetProperty("status").GetString()
        );

        var stale = await ApiScenario.Expect(
            await SetStatus(s, bike, "active", 1),
            409,
            "stale_version"
        );
        Assert.Equal(2, stale.GetProperty("currentVersion").GetInt64());

        // Setting the same status again is a no-op that still checks the version.
        var same = await SetStatus(s, bike, "retired", 2);
        Assert.Equal(200, (int)same.StatusCode);
        Assert.Equal(
            2,
            (await same.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("version").GetInt64()
        );

        var active = await SetStatus(s, bike, "active", 2);
        Assert.Equal(200, (int)active.StatusCode);
        Assert.Equal(
            3,
            (await active.Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("version")
                .GetInt64()
        );
        await ApiScenario.Expect(await SetStatus(s, bike, "deleted", 3), 400, "invalid_input");
        await ApiScenario.Expect(
            await SetStatus(s, Guid.NewGuid(), "retired", 1),
            404,
            "not_found"
        );
    }

    [Fact]
    public async Task RetiredBikeRefusesNewRidesAndPartsButKeepsItsHistoryEditable()
    {
        await using var s = await ApiScenario.Open();
        var (bike, chain, installation) = await s.Equipment();
        var active = await s.Bike("Synthetic active");
        var saddle = ApiScenario.Id(await s.Part("saddle"));
        var saddleFit = ApiScenario.Id(await s.Fit(active, saddle, "saddle"));
        var ride = ApiScenario.Id(await s.Ride(bike, ApiScenario.Start.AddDays(1), 40000));
        var elsewhere = ApiScenario.Id(await s.Ride(active, ApiScenario.Start.AddDays(1), 5000));
        var reminder = await s.Client.PutAsJsonAsync(
            $"/api/bikes/{bike}/reminder",
            new
            {
                enabled = true,
                method = "oil",
                oilThresholdMetres = 30000,
                waxThresholdMetres = 300000,
                expectedVersion = 0,
            }
        );
        Assert.Equal(200, (int)reminder.StatusCode);
        var due = await s.Read($"/api/bikes/{bike}/reminder");
        Assert.Equal("ready", due.GetProperty("state").GetString());
        Assert.True(due.GetProperty("due").GetBoolean());
        var before = await Overview(s, bike);
        var chainBefore = await s.Lifetime(chain);

        Assert.Equal(200, (int)(await SetStatus(s, bike, "retired", 1)).StatusCode);

        var paused = await s.Read($"/api/bikes/{bike}/reminder");
        Assert.Equal("paused", paused.GetProperty("state").GetString());
        Assert.False(paused.GetProperty("due").GetBoolean());
        Assert.True(paused.GetProperty("enabled").GetBoolean());
        Assert.Equal(30000, paused.GetProperty("oilThresholdMetres").GetInt64());
        Assert.Equal(
            "paused",
            (await s.Read($"/api/bikes/{bike}/overview"))
                .GetProperty("reminder")
                .GetProperty("state")
                .GetString()
        );

        var later = ApiScenario.Start.AddDays(5);
        var spare = await s.Chain();
        await ApiScenario.Expect(
            await s.Client.PostAsJsonAsync(
                "/api/rides",
                new
                {
                    bikeId = bike,
                    startUtc = later,
                    distanceMetres = 1000,
                }
            ),
            409,
            "bike_retired"
        );
        await ApiScenario.Expect(
            await s.Client.PutAsJsonAsync(
                $"/api/rides/{elsewhere}",
                new
                {
                    bikeId = bike,
                    startUtc = ApiScenario.Start.AddDays(1),
                    distanceMetres = 5000,
                    expectedVersion = 1,
                }
            ),
            409,
            "bike_retired"
        );
        await ApiScenario.Expect(
            await s.Client.PostAsJsonAsync(
                "/api/installations",
                new
                {
                    bikeId = bike,
                    componentId = saddle,
                    position = "saddle",
                    startUtc = later,
                }
            ),
            409,
            "bike_retired"
        );
        await ApiScenario.Expect(
            await s.Client.PostAsJsonAsync(
                "/api/installations/pair",
                new
                {
                    bikeId = bike,
                    type = "tyre",
                    make = "Synthetic",
                    model = "Pair",
                    startUtc = later,
                }
            ),
            409,
            "bike_retired"
        );
        await ApiScenario.Expect(
            await s.Client.PostAsJsonAsync(
                $"/api/installations/{saddleFit}/move",
                new
                {
                    toBikeId = bike,
                    movedAtUtc = later,
                    expectedInstallationVersion = 1,
                }
            ),
            409,
            "bike_retired"
        );
        await ApiScenario.Expect(
            await s.Client.PostAsJsonAsync(
                $"/api/installations/{installation}/replacement",
                new
                {
                    newComponentId = spare,
                    replacedAtUtc = later,
                    expectedInstallationVersion = 1,
                }
            ),
            409,
            "bike_retired"
        );
        await ApiScenario.Expect(
            await s.Client.PostAsJsonAsync(
                $"/api/installations/{installation}/replacement-with-service",
                new
                {
                    newMake = "Synthetic",
                    newModel = "New chain",
                    replacedAtUtc = later,
                    expectedInstallationVersion = 1,
                }
            ),
            409,
            "bike_retired"
        );
        Assert.Equal(chainBefore, await s.Lifetime(chain));
        Assert.Equal(5000, await s.Lifetime(saddle));

        // History on the retired bike stays correctable.
        var corrected = await s.Client.PutAsJsonAsync(
            $"/api/rides/{ride}",
            new
            {
                bikeId = bike,
                startUtc = ApiScenario.Start.AddDays(1),
                distanceMetres = 40000,
                expectedVersion = 1,
            }
        );
        Assert.Equal(200, (int)corrected.StatusCode);
        Assert.Equal(200, (int)(await SetStatus(s, bike, "active", 2)).StatusCode);
        Assert.Equal(before, await Overview(s, bike));
        var resumed = await s.Read($"/api/bikes/{bike}/reminder");
        Assert.Equal("ready", resumed.GetProperty("state").GetString());
        Assert.True(resumed.GetProperty("due").GetBoolean());

        // Maintenance, ending a fitting and deleting a ride work on a retired bike.
        Assert.Equal(200, (int)(await SetStatus(s, bike, "retired", 3)).StatusCode);
        var maintenance = await s.Client.PostAsJsonAsync(
            "/api/maintenance",
            new
            {
                bikeId = bike,
                componentId = chain,
                task = "Clean chain",
                performedUtc = ApiScenario.Start.AddDays(1).AddHours(12),
            }
        );
        Assert.Equal(201, (int)maintenance.StatusCode);
        Assert.Equal(
            200,
            (int)
                (
                    await s.Client.PutAsJsonAsync(
                        $"/api/installations/{installation}",
                        new
                        {
                            startUtc = ApiScenario.Start,
                            endUtc = ApiScenario.Start.AddDays(4),
                            expectedVersion = 1,
                        }
                    )
                ).StatusCode
        );
        Assert.Equal(
            204,
            (int)(await s.Client.DeleteAsync($"/api/rides/{ride}?expectedVersion=2")).StatusCode
        );
        Assert.Equal(0, await s.Lifetime(chain));
    }
}
