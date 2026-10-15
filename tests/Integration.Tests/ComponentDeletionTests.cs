using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Components;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Integration.Tests;

public class ComponentDeletionTests
{
    private static readonly DateTimeOffset September = DateTimeOffset.Parse("2026-09-01T00:00:00Z");

    private static Task<HttpResponseMessage> Delete(ApiScenario s, Guid component, long version) =>
        s.Client.DeleteAsync($"/api/components/{component}?expectedVersion={version}");

    [Fact]
    public async Task DeletingASpareRemovesItsHistoryAndLeavesAGap()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike("Synthetic A");
        var chain = await s.Chain();
        var september = ApiScenario.Id(
            await s.Create(
                "/api/installations",
                new
                {
                    bikeId = bike,
                    componentId = chain,
                    position = "chain",
                    startUtc = September,
                    endUtc = September.AddDays(30),
                }
            )
        );
        var ride = ApiScenario.Id(await s.Ride(bike, September.AddDays(10), 30000));
        var maintenance = await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = bike,
                componentId = chain,
                task = "Clean chain",
                performedUtc = September.AddDays(11),
            }
        );
        Assert.Equal(30000, await s.Lifetime(chain));

        Assert.Equal(204, (int)(await Delete(s, chain, 1)).StatusCode);

        await ApiScenario.Expect(
            await s.Client.GetAsync($"/api/components/{chain}"),
            404,
            "not_found"
        );
        Assert.DoesNotContain(
            (await s.Read("/api/components")).GetProperty("items").EnumerateArray(),
            x => ApiScenario.Id(x) == chain
        );
        await ApiScenario.Expect(
            await s.Client.GetAsync($"/api/installations/{september}"),
            404,
            "not_found"
        );
        var usage = await s.Read($"/api/bikes/{bike}/overview");
        Assert.Contains(
            usage.GetProperty("allocationGaps").EnumerateArray(),
            x =>
                x.GetProperty("rideId").GetGuid() == ride
                && x.GetProperty("position").GetString() == "chain"
        );
        var kept = await s.Read($"/api/maintenance/{ApiScenario.Id(maintenance)}");
        Assert.Equal(JsonValueKind.Null, kept.GetProperty("componentId").ValueKind);
        Assert.Equal("Clean chain", kept.GetProperty("task").GetString());
        await using var db = TestDatabase.Open(s.ConnectionString);
        Assert.False(await db.ComponentUsages.AnyAsync(x => x.ComponentId == chain));
        Assert.False(await db.InstallationUsages.AnyAsync(x => x.InstallationId == september));
    }

    [Fact]
    public async Task DeletingAFittedPartEmptiesItsPosition()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        var saddle = ApiScenario.Id(await s.Part("saddle"));
        await s.Fit(bike, saddle, "saddle");
        Assert.Equal(
            "fitted",
            ApiScenario
                .Status(await s.Read($"/api/bikes/{bike}/usage"), "saddle")
                .GetProperty("state")
                .GetString()
        );
        Assert.Equal(204, (int)(await Delete(s, saddle, 1)).StatusCode);
        // With its only fitting gone, the saddle position has no recorded history.
        var status = ApiScenario.Status(await s.Read($"/api/bikes/{bike}/usage"), "saddle");
        Assert.Equal("not-recorded", status.GetProperty("state").GetString());
        Assert.Equal(JsonValueKind.Null, status.GetProperty("componentId").ValueKind);
    }

    [Fact]
    public async Task StaleOrForeignDeletionsChangeNothing()
    {
        await using var s = await ApiScenario.Open();
        var (bike, chain, _) = await s.Equipment();
        await s.Ride(bike, ApiScenario.Start.AddDays(1), 20000);
        var edited = await s.Client.PutAsJsonAsync(
            $"/api/components/{chain}",
            new
            {
                make = "Synthetic",
                model = "Renamed",
                expectedVersion = 1,
            }
        );
        Assert.Equal(200, (int)edited.StatusCode);
        var stale = await ApiScenario.Expect(await Delete(s, chain, 1), 409, "stale_version");
        Assert.Equal(2, stale.GetProperty("currentVersion").GetInt64());
        Assert.Equal(20000, await s.Lifetime(chain));

        var foreign = new Component
        {
            OwnerId = Guid.NewGuid(),
            Type = ComponentType.Chain,
            Make = "Other",
            Model = "Owner",
        };
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            db.Components.Add(foreign);
            await db.SaveChangesAsync();
        }
        await ApiScenario.Expect(await Delete(s, foreign.Id, 1), 404, "not_found");
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            Assert.True(await db.Components.AnyAsync(x => x.Id == foreign.Id));
        }
    }

    [Fact]
    public async Task PartHistoryNamesEveryBikeIncludingDeletedOnes()
    {
        await using var s = await ApiScenario.Open();
        var a = await s.Bike("Synthetic A");
        var b = await s.Bike("Synthetic B");
        var chain = await s.Chain();
        var fit = ApiScenario.Id(await s.Fit(a, chain, "chain"));
        var move = await s.Client.PostAsJsonAsync(
            $"/api/installations/{fit}/move",
            new
            {
                toBikeId = b,
                movedAtUtc = ApiScenario.Start.AddDays(5),
                expectedInstallationVersion = 1,
            }
        );
        Assert.Equal(200, (int)move.StatusCode);
        await s.MarkDeleted(a);

        var part = await s.Read($"/api/components/{chain}");
        var bikes = part.GetProperty("bikes").EnumerateArray().ToArray();
        Assert.Equal(2, bikes.Length);
        Assert.Equal(a, ApiScenario.Id(bikes[0]));
        Assert.Equal("deleted", bikes[0].GetProperty("state").GetString());
        Assert.Equal("Synthetic A", bikes[0].GetProperty("displayName").GetString());
        Assert.Equal(b, ApiScenario.Id(bikes[1]));
        Assert.Equal("active", bikes[1].GetProperty("state").GetString());
        var listed = (await s.Read("/api/components"))
            .GetProperty("items")
            .EnumerateArray()
            .Single(x => ApiScenario.Id(x) == chain);
        Assert.Equal(2, listed.GetProperty("bikes").GetArrayLength());
        Assert.Equal(
            0,
            (await s.Read($"/api/components/{await s.Chain()}"))
                .GetProperty("bikes")
                .GetArrayLength()
        );
    }
}
