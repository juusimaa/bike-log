using System.Net.Http.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Integration.Tests.Fixtures;
namespace BikeLog.Integration.Tests;

public class EquipmentApiTests
{
    [Fact]
    public async Task CreatesBikeChainAndInstallation()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        Assert.Equal(e.Bike, ApiScenario.Id(await s.Read($"/api/bikes/{e.Bike}")));
        Assert.Equal(e.Chain, ApiScenario.Id(await s.Read($"/api/components/{e.Chain}")));
    }
    [Fact]
    public async Task ReplacementClosesOldAndOpensNewAtomically()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var chain = await s.Chain();
        var at = ApiScenario.Start.AddDays(1);
        var r = await s.Client.PostAsJsonAsync($"/api/installations/{e.Installation}/replacement", new
        {
            newComponentId = chain,
            replacedAtUtc = at,
            expectedInstallationVersion = 1
        });
        Assert.Equal(200, (int)r.StatusCode);
        var old = await s.Read($"/api/components/{e.Chain}");
        Assert.Equal(at, old.GetProperty("installations")[0].GetProperty("endUtc").GetDateTimeOffset());
        var next = await s.Read($"/api/components/{chain}");
        Assert.Equal(at, next.GetProperty("installations")[0].GetProperty("startUtc").GetDateTimeOffset());
    }
    [Fact]
    public async Task ConcurrentInstallsYieldOneSuccessAndOne409()
    {
        await using var s = await ApiScenario.Open();
        var bike = ApiScenario.Id(await s.Create("/api/bikes", new
        {
            name = "Concurrent"
        }));
        var a = await s.Chain();
        var b = await s.Chain();
        var r = await Task.WhenAll(s.Client.PostAsJsonAsync("/api/installations", new
        {
            bikeId = bike,
            componentId = a,
            position = "chain",
            startUtc = ApiScenario.Start
        }), s.Client.PostAsJsonAsync("/api/installations", new
        {
            bikeId = bike,
            componentId = b,
            position = "chain",
            startUtc = ApiScenario.Start
        }));
        Assert.Equal(new[] { 201, 409 }, r.Select(x => (int)x.StatusCode).Order().ToArray());
    }
    [Fact]
    public async Task InvalidReplacementChangesNothing()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var r = await s.Client.PostAsJsonAsync($"/api/installations/{e.Installation}/replacement", new
        {
            newComponentId = e.Chain,
            replacedAtUtc = ApiScenario.Start.AddDays(1),
            expectedInstallationVersion = 1
        });
        Assert.Equal(400, (int)r.StatusCode);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, (await s.Read($"/api/components/{e.Chain}")).GetProperty("installations")[0].GetProperty("endUtc").ValueKind);
    }
    [Fact]
    public async Task StaleInstallationReturns409WithCurrentVersion()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var r = await s.Client.PutAsJsonAsync($"/api/installations/{e.Installation}", new
        {
            startUtc = ApiScenario.Start,
            expectedVersion = 0
        });
        Assert.Equal(409, (int)r.StatusCode);
        Assert.Equal(1, (await r.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("currentVersion").GetInt64());
    }
    [Fact]
    public async Task OtherOwnerIdsReturn404WithoutMutation()
    {
        await using var s = await ApiScenario.Open();
        await using var db = TestDatabase.Open(s.ConnectionString);
        var other = new Bike { OwnerId = Guid.NewGuid(), Name = "Private" };
        db.Add(other);
        await db.SaveChangesAsync();
        Assert.Equal(404, (int)(await s.Client.GetAsync($"/api/bikes/{other.Id}")).StatusCode);
        var chain = await s.Chain();
        Assert.Equal(404, (int)(await s.Client.PostAsJsonAsync("/api/installations", new
        {
            bikeId = other.Id,
            componentId = chain,
            position = "chain",
            startUtc = ApiScenario.Start
        })).StatusCode);
    }
    [Fact]
    public async Task HistoricalCorrectionRejectsOverlap()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var chain = await s.Chain();
        var r = await s.Client.PostAsJsonAsync($"/api/installations/{e.Installation}/replacement", new
        {
            newComponentId = chain,
            replacedAtUtc = ApiScenario.Start.AddDays(1),
            expectedInstallationVersion = 1
        });
        Assert.Equal(200, (int)r.StatusCode);
        r = await s.Client.PutAsJsonAsync($"/api/installations/{e.Installation}", new
        {
            startUtc = ApiScenario.Start,
            endUtc = ApiScenario.Start.AddDays(2),
            expectedVersion = 2
        });
        Assert.Equal(409, (int)r.StatusCode);
    }
}
