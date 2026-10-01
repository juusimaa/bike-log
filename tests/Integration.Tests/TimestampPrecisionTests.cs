using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class TimestampPrecisionTests
{
    [Fact]
    public async Task SubmicrosecondReplacementAndRideAreRejected()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var b = await s.Chain();
        var at = ApiScenario.Start.AddDays(1);
        var r = await s.Client.PostAsJsonAsync(
            $"/api/installations/{e.Installation}/replacement",
            new
            {
                newComponentId = b,
                replacedAtUtc = at.AddTicks(9),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(400, (int)r.StatusCode);
        Assert.Equal(
            JsonValueKind.Null,
            (await s.Read($"/api/installations/{e.Installation}")).GetProperty("endUtc").ValueKind
        );
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.PostAsJsonAsync(
                        "/api/rides",
                        new
                        {
                            bikeId = e.Bike,
                            startUtc = at.AddTicks(8),
                            distanceMetres = 100,
                        }
                    )
                ).StatusCode
        );
        await using var db = TestDatabase.Open(s.ConnectionString);
        Assert.Empty(db.Rides);
    }

    [Fact]
    public async Task CollapsedPrecisionIntervalReturns400WithoutSaving()
    {
        await using var s = await ApiScenario.Open();
        var bike = ApiScenario.Id(await s.Create("/api/bikes", new { name = "Precision" }));
        var chain = await s.Chain();
        var r = await s.Client.PostAsJsonAsync(
            "/api/installations",
            new
            {
                bikeId = bike,
                componentId = chain,
                position = "chain",
                startUtc = ApiScenario.Start.AddTicks(1),
                endUtc = ApiScenario.Start.AddTicks(9),
            }
        );
        Assert.Equal(400, (int)r.StatusCode);
        await using var db = TestDatabase.Open(s.ConnectionString);
        Assert.Empty(db.Installations);
    }

    [Theory]
    [InlineData("2026-01-01T00:00:00")]
    [InlineData("0001-01-01T00:00:00Z")]
    public async Task UnspecifiedOffsetAndInfinitySentinelAreRejected(string instant)
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.PostAsJsonAsync(
                        "/api/rides",
                        new
                        {
                            bikeId = e.Bike,
                            startUtc = instant,
                            distanceMetres = 100,
                        }
                    )
                ).StatusCode
        );
    }
}
