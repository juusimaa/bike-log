using System.Net.Http.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Rides;
using BikeLog.Domain.Usage;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BikeLog.Integration.Tests;

public class RideApiTests
{
    private sealed class FailingCalculator : IUsageCalculator
    {
        public UsageCalculation Calculate(
            IReadOnlyList<Ride> rides,
            IReadOnlyList<Installation> installations
        ) => throw new InvalidOperationException("Injected");
    }

    [Fact]
    public async Task RideCorrectionAndDeletionRebuildTotals()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var ride = ApiScenario.Id(
            await s.Create(
                "/api/rides",
                new
                {
                    bikeId = e.Bike,
                    startUtc = ApiScenario.Start,
                    distanceMetres = 65000,
                }
            )
        );
        Assert.Equal(
            200,
            (int)
                (
                    await s.Client.PutAsJsonAsync(
                        $"/api/rides/{ride}",
                        new
                        {
                            bikeId = e.Bike,
                            startUtc = ApiScenario.Start,
                            distanceMetres = 10000,
                            expectedVersion = 1,
                        }
                    )
                ).StatusCode
        );
        Assert.Equal(
            10000,
            (await s.Read($"/api/components/{e.Chain}/usage"))
                .GetProperty("lifetimeMetres")
                .GetInt64()
        );
        Assert.Equal(
            204,
            (int)(await s.Client.DeleteAsync($"/api/rides/{ride}?expectedVersion=2")).StatusCode
        );
        Assert.Equal(
            0,
            (await s.Read($"/api/components/{e.Chain}/usage"))
                .GetProperty("lifetimeMetres")
                .GetInt64()
        );
    }

    [Fact]
    public async Task UnfittedRideProducesVisibleGap()
    {
        await using var s = await ApiScenario.Open();
        var bike = ApiScenario.Id(
            await s.Create(
                "/api/bikes",
                new
                {
                    name = "Unfitted",
                    make = "Synthetic",
                    model = "Test",
                    kind = "gravel",
                    year = 2026,
                }
            )
        );
        var ride = ApiScenario.Id(
            await s.Create(
                "/api/rides",
                new
                {
                    bikeId = bike,
                    startUtc = ApiScenario.Start,
                    distanceMetres = 65000,
                }
            )
        );
        Assert.Contains(
            ride,
            (await s.Read($"/api/bikes/{bike}/usage"))
                .GetProperty("unallocatedRideIds")
                .EnumerateArray()
                .Select(x => x.GetGuid())
        );
    }

    [Fact]
    public async Task MissingDurationDoesNotClaimCompleteHours()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = ApiScenario.Start,
                distanceMetres = 65000,
            }
        );
        var u = await s.Read($"/api/components/{e.Chain}/usage");
        Assert.True(u.GetProperty("hasUnknownDuration").GetBoolean());
        Assert.Equal(0, u.GetProperty("lifetimeSeconds").GetInt64());
    }

    [Theory]
    [InlineData(0, null)]
    [InlineData(-1, 10L)]
    [InlineData(1, 0L)]
    [InlineData(1, -1L)]
    public async Task MalformedAndNonpositiveQuantitiesReturn400(long distance, long? duration)
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
                            startUtc = ApiScenario.Start,
                            distanceMetres = distance,
                            durationSeconds = duration,
                        }
                    )
                ).StatusCode
        );
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.PostAsync(
                        "/api/rides",
                        new StringContent("{bad", System.Text.Encoding.UTF8, "application/json")
                    )
                ).StatusCode
        );
    }

    [Fact]
    public async Task StaleRideDoesNotChangeTotals()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var ride = ApiScenario.Id(
            await s.Create(
                "/api/rides",
                new
                {
                    bikeId = e.Bike,
                    startUtc = ApiScenario.Start,
                    distanceMetres = 65000,
                }
            )
        );
        Assert.Equal(
            409,
            (int)
                (
                    await s.Client.PutAsJsonAsync(
                        $"/api/rides/{ride}",
                        new
                        {
                            bikeId = e.Bike,
                            startUtc = ApiScenario.Start,
                            distanceMetres = 10000,
                            expectedVersion = 0,
                        }
                    )
                ).StatusCode
        );
        Assert.Equal(
            65000,
            (await s.Read($"/api/components/{e.Chain}/usage"))
                .GetProperty("lifetimeMetres")
                .GetInt64()
        );
    }

    [Fact]
    public async Task OtherOwnerRideAndUsageAre404()
    {
        await using var s = await ApiScenario.Open();
        await using var db = TestDatabase.Open(s.ConnectionString);
        var b = new Bike { OwnerId = Guid.NewGuid(), Name = "Other" };
        var r = new Ride
        {
            OwnerId = b.OwnerId,
            BikeId = b.Id,
            StartUtc = ApiScenario.Start,
            DistanceMetres = 10000,
        };
        db.AddRange(b, r);
        await db.SaveChangesAsync();
        Assert.Equal(404, (int)(await s.Client.GetAsync($"/api/rides/{r.Id}")).StatusCode);
        Assert.Equal(404, (int)(await s.Client.GetAsync($"/api/bikes/{b.Id}/usage")).StatusCode);
        Assert.Equal(
            404,
            (int)(await s.Client.DeleteAsync($"/api/rides/{r.Id}?expectedVersion=1")).StatusCode
        );
    }

    [Fact]
    public async Task FailedCorrectionPreservesRideAndProjection()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var ride = ApiScenario.Id(
            await s.Create(
                "/api/rides",
                new
                {
                    bikeId = e.Bike,
                    startUtc = ApiScenario.Start,
                    distanceMetres = 65000,
                }
            )
        );
        await using var bad = new ApiFactory(
            s.ConnectionString,
            configure: services =>
            {
                services.RemoveAll<IUsageCalculator>();
                services.AddSingleton<IUsageCalculator, FailingCalculator>();
            }
        );
        var response = await bad.CreateClient()
            .PutAsJsonAsync(
                $"/api/rides/{ride}",
                new
                {
                    bikeId = e.Bike,
                    startUtc = ApiScenario.Start,
                    distanceMetres = 10000,
                    expectedVersion = 1,
                }
            );
        Assert.Equal(500, (int)response.StatusCode);
        Assert.DoesNotContain("Injected", await response.Content.ReadAsStringAsync());
        Assert.Equal(
            65000,
            (await s.Read($"/api/rides/{ride}")).GetProperty("distanceMetres").GetInt64()
        );
        Assert.Equal(
            65000,
            (await s.Read($"/api/components/{e.Chain}/usage"))
                .GetProperty("lifetimeMetres")
                .GetInt64()
        );
    }

    [Fact]
    public async Task OffsetTimestampRoundTripsAsUtc()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var r = await s.Create(
            "/api/rides",
            new
            {
                bikeId = e.Bike,
                startUtc = "2026-01-01T02:00:00+02:00",
                distanceMetres = 65000,
            }
        );
        Assert.Equal(ApiScenario.Start, r.GetProperty("startUtc").GetDateTimeOffset());
        Assert.Equal(TimeSpan.Zero, r.GetProperty("startUtc").GetDateTimeOffset().Offset);
    }
}
