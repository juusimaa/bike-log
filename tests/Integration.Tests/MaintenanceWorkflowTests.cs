using System.Net.Http.Json;
using BikeLog.Integration.Tests.Fixtures;
namespace BikeLog.Integration.Tests;

public class MaintenanceWorkflowTests
{
    [Fact]
    public async Task RideMaintenanceReplacementPreservesLifetimeHistory()
    { await using var s = await ApiScenario.Open(); var e = await s.Equipment(); await s.Create("/api/rides", new { bikeId = e.Bike, startUtc = ApiScenario.Start.AddHours(1), distanceMetres = 65000, durationSeconds = 3600 }); Assert.Equal(65000, (await s.Read($"/api/components/{e.Chain}/usage")).GetProperty("lifetimeMetres").GetInt64()); await s.Create("/api/maintenance", new { bikeId = e.Bike, componentId = e.Chain, task = "Lubrication", performedUtc = ApiScenario.Start.AddHours(2) }); Assert.Equal(65000, (await s.Read($"/api/components/{e.Chain}/usage")).GetProperty("lifetimeMetres").GetInt64()); var chain = await s.Chain(); Assert.Equal(200, (int)(await s.Client.PostAsJsonAsync($"/api/installations/{e.Installation}/replacement", new { newComponentId = chain, replacedAtUtc = ApiScenario.Start.AddDays(1), expectedInstallationVersion = 1 })).StatusCode); await s.Create("/api/rides", new { bikeId = e.Bike, startUtc = ApiScenario.Start.AddDays(2), distanceMetres = 10000 }); Assert.Equal(65000, (await s.Read($"/api/components/{e.Chain}/usage")).GetProperty("lifetimeMetres").GetInt64()); Assert.Equal(10000, (await s.Read($"/api/components/{chain}/usage")).GetProperty("lifetimeMetres").GetInt64()); Assert.Single((await s.Read($"/api/bikes/{e.Bike}/maintenance")).EnumerateArray()); Assert.Single((await s.Read($"/api/components/{e.Chain}")).GetProperty("installations").EnumerateArray()); }
    [Fact]
    public async Task RideAtReplacementInstantUsesNewChain()
    { await using var s = await ApiScenario.Open(); var e = await s.Equipment(); var chain = await s.Chain(); var at = ApiScenario.Start.AddDays(1); Assert.Equal(200, (int)(await s.Client.PostAsJsonAsync($"/api/installations/{e.Installation}/replacement", new { newComponentId = chain, replacedAtUtc = at, expectedInstallationVersion = 1 })).StatusCode); await s.Create("/api/rides", new { bikeId = e.Bike, startUtc = at.AddTicks(-10), distanceMetres = 10000 }); await s.Create("/api/rides", new { bikeId = e.Bike, startUtc = at, distanceMetres = 65000 }); Assert.Equal(10000, (await s.Read($"/api/components/{e.Chain}/usage")).GetProperty("lifetimeMetres").GetInt64()); Assert.Equal(65000, (await s.Read($"/api/components/{chain}/usage")).GetProperty("lifetimeMetres").GetInt64()); }
    [Fact]
    public async Task HistoricalInstallationCorrectionMovesRideAllocation()
    { await using var s = await ApiScenario.Open(); var e = await s.Equipment(); await s.Create("/api/rides", new { bikeId = e.Bike, startUtc = ApiScenario.Start.AddHours(1), distanceMetres = 65000 }); Assert.Equal(200, (int)(await s.Client.PutAsJsonAsync($"/api/installations/{e.Installation}", new { startUtc = ApiScenario.Start.AddHours(2), expectedVersion = 1 })).StatusCode); Assert.Equal(0, (await s.Read($"/api/components/{e.Chain}/usage")).GetProperty("lifetimeMetres").GetInt64()); Assert.Single((await s.Read($"/api/bikes/{e.Bike}/usage")).GetProperty("unallocatedRideIds").EnumerateArray()); }
}
