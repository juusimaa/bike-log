using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Api.Operations;
using BikeLog.Domain.Usage;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BikeLog.Integration.Tests;

public class DeletedBikeVisibilityTests
{
    [Fact]
    public async Task DeletedBikeIsHiddenButItsRidesStayReadableAndAllocated()
    {
        await using var s = await ApiScenario.Open();
        var (bike, chain, installation) = await s.Equipment();
        var ride = ApiScenario.Id(await s.Ride(bike, ApiScenario.Start.AddDays(1), 40000));
        // The chain is a kept part: its fitting on the deleted bike is closed.
        Assert.Equal(
            200,
            (int)
                (
                    await s.Client.PutAsJsonAsync(
                        $"/api/installations/{installation}",
                        new
                        {
                            startUtc = ApiScenario.Start,
                            endUtc = ApiScenario.Start.AddDays(2),
                            expectedVersion = 1,
                        }
                    )
                ).StatusCode
        );
        var other = await s.Bike("Synthetic other");
        await s.MarkDeleted(bike);

        var bikes = await s.Read("/api/bikes");
        Assert.DoesNotContain(
            bikes.GetProperty("items").EnumerateArray(),
            x => ApiScenario.Id(x) == bike
        );
        Assert.Contains(
            bikes.GetProperty("items").EnumerateArray(),
            x => ApiScenario.Id(x) == other
        );
        await ApiScenario.Expect(await s.Client.GetAsync($"/api/bikes/{bike}"), 404, "not_found");
        await ApiScenario.Expect(
            await s.Client.GetAsync($"/api/bikes/{bike}/overview"),
            404,
            "not_found"
        );
        var spare = await s.Chain();
        await ApiScenario.Expect(
            await s.Client.PostAsJsonAsync(
                "/api/installations",
                new
                {
                    bikeId = bike,
                    componentId = spare,
                    position = "chain",
                    startUtc = ApiScenario.Start.AddDays(3),
                }
            ),
            404,
            "not_found"
        );
        await ApiScenario.Expect(
            await s.Client.PostAsJsonAsync(
                "/api/rides",
                new
                {
                    bikeId = bike,
                    startUtc = ApiScenario.Start.AddDays(3),
                    distanceMetres = 1000,
                }
            ),
            404,
            "not_found"
        );

        Assert.Equal(bike, (await s.Read($"/api/rides/{ride}")).GetProperty("bikeId").GetGuid());
        var corrected = await s.Client.PutAsJsonAsync(
            $"/api/rides/{ride}",
            new
            {
                bikeId = bike,
                startUtc = ApiScenario.Start.AddDays(1),
                distanceMetres = 30000,
                expectedVersion = 1,
            }
        );
        Assert.Equal(200, (int)corrected.StatusCode);
        Assert.Equal(30000, await s.Lifetime(chain));

        await using var db = TestDatabase.Open(s.ConnectionString);
        await new UsageRebuilder(db, new UsageCalculator()).RebuildAsync(
            ApiScenario.Owner,
            CancellationToken.None
        );
        Assert.Equal(30000, await s.Lifetime(chain));

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(
                new Dictionary<string, string?>
                {
                    ["AccessMode"] = "Synthetic",
                    ["LocalSyntheticMode"] = "true",
                    ["ConnectionStrings:Postgres"] = s.ConnectionString,
                }
            )
            .Build();
        var purged = await SyntheticOwnerPurge.PurgeAsync(
            db,
            configuration,
            "Development",
            ApiScenario.Owner,
            true,
            CancellationToken.None
        );
        Assert.Equal(2, purged.Bikes);
        Assert.False(await db.Bikes.IgnoreQueryFilters().AnyAsync());
    }

    [Fact]
    public async Task DeletedBikeDoesNotAppearToOtherReads()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Bike();
        await s.MarkDeleted(bike);
        foreach (
            var path in new[]
            {
                $"/api/bikes/{bike}/rides",
                $"/api/bikes/{bike}/installations",
                $"/api/bikes/{bike}/usage",
                $"/api/bikes/{bike}/reminder",
            }
        )
        {
            await ApiScenario.Expect(await s.Client.GetAsync(path), 404, "not_found");
        }
        Assert.Equal(
            JsonValueKind.Array,
            (await s.Read("/api/bikes")).GetProperty("items").ValueKind
        );
    }
}
