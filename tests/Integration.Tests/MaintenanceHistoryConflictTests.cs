using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class MaintenanceHistoryConflictTests
{
    [Fact]
    public async Task ReplacementCannotInvalidateRecordedMaintenance()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var b = await s.Chain();
        await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = e.Bike,
                componentId = e.Chain,
                task = "Inspect",
                performedUtc = ApiScenario.Start.AddDays(2),
            }
        );
        await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = ApiScenario.Start.AddDays(3),
                distanceMetres = 65000,
            }
        );
        var r = await s.Client.PostAsJsonAsync(
            $"/api/installations/{e.Installation}/replacement",
            new
            {
                newComponentId = b,
                replacedAtUtc = ApiScenario.Start.AddDays(1),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(409, (int)r.StatusCode);
        Assert.Equal(
            "maintenance_history_conflict",
            (await r.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()
        );
        var i = await s.Read($"/api/installations/{e.Installation}");
        Assert.Equal(1, i.GetProperty("version").GetInt64());
        Assert.Equal(JsonValueKind.Null, i.GetProperty("endUtc").ValueKind);
        Assert.Equal(
            65000,
            (await s.Read($"/api/components/{e.Chain}/usage"))
                .GetProperty("lifetimeMetres")
                .GetInt64()
        );
        Assert.Empty(
            (await s.Read($"/api/components/{b}")).GetProperty("installations").EnumerateArray()
        );
        Assert.Single((await s.Read($"/api/bikes/{e.Bike}/maintenance")).EnumerateArray());
    }

    [Fact]
    public async Task CorrectionCannotMoveInstallationPastRecordedMaintenance()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = e.Bike,
                componentId = e.Chain,
                task = "Inspect",
                performedUtc = ApiScenario.Start.AddDays(1),
            }
        );
        var r = await s.Client.PutAsJsonAsync(
            $"/api/installations/{e.Installation}",
            new { startUtc = ApiScenario.Start.AddDays(2), expectedVersion = 1 }
        );
        Assert.Equal(409, (int)r.StatusCode);
        Assert.Equal(
            ApiScenario.Start,
            (await s.Read($"/api/installations/{e.Installation}"))
                .GetProperty("startUtc")
                .GetDateTimeOffset()
        );
    }
}
