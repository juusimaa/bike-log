using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Domain.Components;
using BikeLog.Domain.Installations;
using BikeLog.Domain.Maintenance;
using BikeLog.Domain.Reminders;
using BikeLog.Domain.Rides;
using BikeLog.Domain.Usage;
using BikeLog.Infrastructure.Persistence;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Integration.Tests;

public class AuthenticatedOwnershipTests
{
    private sealed class Scenario : IAsyncDisposable
    {
        private readonly PostgresFixture database = new();
        private readonly TestIssuer issuer = new();
        private ApiFactory app = null!;
        public Guid OwnerA { get; } = Guid.NewGuid();
        public Guid OwnerB { get; } = Guid.NewGuid();
        public string ConnectionString => database.ConnectionString;
        public HttpClient A { get; private set; } = null!;
        public HttpClient B { get; private set; } = null!;

        public static async Task<Scenario> Open()
        {
            var s = new Scenario();
            await s.database.InitializeAsync();
            await using (var db = TestDatabase.Open(s.ConnectionString))
            {
                await db.Database.MigrateAsync();
                db.BikeLogUsers.AddRange(
                    new BikeLogUser
                    {
                        OwnerId = s.OwnerA,
                        Issuer = TestIssuer.Issuer,
                        Subject = "email|owner-a",
                        Enabled = true,
                    },
                    new BikeLogUser
                    {
                        OwnerId = s.OwnerB,
                        Issuer = TestIssuer.Issuer,
                        Subject = "email|owner-b",
                        Enabled = true,
                    }
                );
                await db.SaveChangesAsync();
            }
            s.app = s.issuer.Factory(s.ConnectionString);
            s.A = s.app.CreateClient();
            s.B = s.app.CreateClient();
            s.A.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                s.issuer.Token("email|owner-a")
            );
            s.B.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                s.issuer.Token("email|owner-b")
            );
            return s;
        }

        public async ValueTask DisposeAsync()
        {
            A?.Dispose();
            B?.Dispose();
            if (app is not null)
            {
                await app.DisposeAsync();
            }
            issuer.Dispose();
            await database.DisposeAsync();
        }
    }

    [Fact]
    public async Task AuthenticatedCreateUsesResolvedOwnerAndForeignBikeIsHidden()
    {
        await using var s = await Scenario.Open();
        var created = await s.A.PostAsJsonAsync(
            "/api/bikes",
            new
            {
                name = "Owner A bike",
                make = "Test",
                model = "One",
                kind = "gravel",
                year = 2026,
            }
        );
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var bike = await created.Content.ReadFromJsonAsync<JsonElement>();
        var id = bike.GetProperty("id").GetGuid();

        await using var db = TestDatabase.Open(s.ConnectionString);
        Assert.Equal(s.OwnerA, (await db.Bikes.SingleAsync(x => x.Id == id)).OwnerId);
        Assert.Equal(HttpStatusCode.NotFound, (await s.B.GetAsync($"/api/bikes/{id}")).StatusCode);
        var bList = await s.B.GetFromJsonAsync<JsonElement>("/api/bikes");
        Assert.Empty(bList.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task CursorFromAnotherOwnerCannotPageMyCollection()
    {
        await using var s = await Scenario.Open();
        foreach (var client in new[] { s.A, s.A, s.B, s.B })
        {
            var created = await client.PostAsJsonAsync(
                "/api/bikes",
                new
                {
                    name = "Bike",
                    make = "Test",
                    model = "One",
                    kind = "gravel",
                    year = 2026,
                }
            );
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        }
        var first = await s.A.GetFromJsonAsync<JsonElement>("/api/bikes?pageSize=1");
        var cursor = first.GetProperty("nextCursor").GetString();
        Assert.NotNull(cursor);

        var response = await s.B.GetAsync(
            "/api/bikes?pageSize=1&cursor=" + Uri.EscapeDataString(cursor)
        );

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ForeignResourceReadsAndNestedMutationsReturnTheSameNotFoundShape()
    {
        await using var s = await Scenario.Open();
        var bike = new Bike { OwnerId = s.OwnerA, Name = "Owner A secret bike" };
        var component = new Component { OwnerId = s.OwnerA, Model = "Owner A secret chain" };
        var installation = new Installation
        {
            OwnerId = s.OwnerA,
            BikeId = bike.Id,
            ComponentId = component.Id,
            StartUtc = ApiScenario.Start,
        };
        var ride = new Ride
        {
            OwnerId = s.OwnerA,
            BikeId = bike.Id,
            StartUtc = ApiScenario.Start,
            DistanceMetres = 10000,
        };
        var maintenance = new MaintenanceRecord
        {
            OwnerId = s.OwnerA,
            BikeId = bike.Id,
            ComponentId = component.Id,
            Task = "clean",
            PerformedUtc = ApiScenario.Start,
        };
        var reminder = new ChainLubricationRule
        {
            OwnerId = s.OwnerA,
            BikeId = bike.Id,
            Enabled = false,
        };
        var exemption = new PositionExemption
        {
            OwnerId = s.OwnerA,
            BikeId = bike.Id,
            Position = InstallationPosition.FrontInnerTube,
            Reason = ExemptionReason.Tubeless,
            StartUtc = ApiScenario.Start,
        };
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            db.AddRange(bike, component, installation, ride, maintenance, reminder, exemption);
            await db.SaveChangesAsync();
            await new UsageRebuilder(db, new UsageCalculator()).RebuildAsync(
                s.OwnerA,
                CancellationToken.None
            );
        }

        var routes = new[]
        {
            $"/api/bikes/{bike.Id}",
            $"/api/bikes/{bike.Id}/overview",
            $"/api/bikes/{bike.Id}/usage",
            $"/api/bikes/{bike.Id}/reminder",
            $"/api/bikes/{bike.Id}/rides",
            $"/api/bikes/{bike.Id}/maintenance",
            $"/api/bikes/{bike.Id}/installations",
            $"/api/bikes/{bike.Id}/position-exemptions",
            $"/api/components/{component.Id}",
            $"/api/components/{component.Id}/usage",
            $"/api/components/{component.Id}/maintenance",
            $"/api/rides/{ride.Id}",
            $"/api/installations/{installation.Id}",
            $"/api/maintenance/{maintenance.Id}",
        };
        foreach (var route in routes)
        {
            var own = await s.A.GetAsync(route);
            Assert.True(
                own.StatusCode == HttpStatusCode.OK,
                $"{route}: {(int)own.StatusCode} {await own.Content.ReadAsStringAsync()}"
            );
            var foreign = await s.B.GetAsync(route);
            Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
            var body = await foreign.Content.ReadAsStringAsync();
            Assert.DoesNotContain("Owner A secret", body);
            Assert.DoesNotContain("currentVersion", body);
        }

        var foreignBikeWrite = await s.B.PutAsJsonAsync(
            $"/api/bikes/{bike.Id}",
            new
            {
                name = "Stolen",
                make = "Test",
                model = "One",
                kind = "gravel",
                year = 2026,
                expectedVersion = 0,
            }
        );
        Assert.Equal(HttpStatusCode.NotFound, foreignBikeWrite.StatusCode);
        Assert.DoesNotContain("currentVersion", await foreignBikeWrite.Content.ReadAsStringAsync());

        var guessedRide = await s.B.PostAsJsonAsync(
            "/api/rides",
            new
            {
                bikeId = bike.Id,
                startUtc = ApiScenario.Start,
                distanceMetres = 1000,
            }
        );
        Assert.Equal(HttpStatusCode.NotFound, guessedRide.StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await s.B.PutAsJsonAsync(
                    $"/api/components/{component.Id}/estimate",
                    new { initialUsageEstimateMetres = 1000, expectedVersion = 0 }
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await s.B.DeleteAsync($"/api/rides/{ride.Id}?expectedVersion=0")).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await s.B.PutAsJsonAsync(
                    $"/api/rides/{ride.Id}",
                    new
                    {
                        bikeId = bike.Id,
                        startUtc = ApiScenario.Start,
                        distanceMetres = 2000,
                        expectedVersion = 0,
                    }
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await s.B.PostAsJsonAsync(
                    "/api/installations",
                    new
                    {
                        bikeId = bike.Id,
                        componentId = component.Id,
                        position = "chain",
                        startUtc = ApiScenario.Start,
                    }
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await s.B.PostAsJsonAsync(
                    "/api/maintenance",
                    new
                    {
                        bikeId = bike.Id,
                        task = "clean",
                        performedUtc = ApiScenario.Start,
                    }
                )
            ).StatusCode
        );
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await s.B.PostAsJsonAsync(
                    $"/api/installations/{installation.Id}/replacement",
                    new
                    {
                        newComponentId = Guid.NewGuid(),
                        replacedAtUtc = ApiScenario.Start.AddDays(1),
                        expectedInstallationVersion = 0,
                    }
                )
            ).StatusCode
        );

        var ownB = await s.B.PostAsJsonAsync(
            "/api/bikes",
            new
            {
                name = "Owner B bike",
                make = "Test",
                model = "B",
                kind = "road",
                year = 2026,
            }
        );
        var bikeB = (await ownB.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id")
            .GetGuid();
        var foreignWrites = new (string Route, Func<Task<HttpResponseMessage>> Send)[]
        {
            (
                "create exemption",
                () =>
                    s.B.PostAsJsonAsync(
                        $"/api/bikes/{bike.Id}/position-exemptions",
                        new { position = "front-derailleur", startUtc = ApiScenario.Start }
                    )
            ),
            (
                "correct exemption",
                () =>
                    s.B.PutAsJsonAsync(
                        $"/api/position-exemptions/{exemption.Id}",
                        new
                        {
                            startUtc = ApiScenario.Start,
                            endUtc = ApiScenario.Start.AddDays(1),
                            expectedVersion = 1,
                        }
                    )
            ),
            (
                "edit component",
                () =>
                    s.B.PutAsJsonAsync(
                        $"/api/components/{component.Id}",
                        new
                        {
                            make = "Stolen",
                            model = "Stolen",
                            weightGrams = 1,
                            expectedVersion = 1,
                        }
                    )
            ),
            (
                "pair",
                () =>
                    s.B.PostAsJsonAsync(
                        "/api/installations/pair",
                        new
                        {
                            bikeId = bike.Id,
                            type = "brake",
                            make = "Stolen",
                            model = "Stolen",
                            startUtc = ApiScenario.Start,
                        }
                    )
            ),
            (
                "move foreign installation",
                () =>
                    s.B.PostAsJsonAsync(
                        $"/api/installations/{installation.Id}/move",
                        new
                        {
                            toBikeId = bikeB,
                            movedAtUtc = ApiScenario.Start.AddDays(1),
                            expectedInstallationVersion = 1,
                        }
                    )
            ),
        };
        foreach (var (route, send) in foreignWrites)
        {
            var response = await send();
            Assert.True(
                response.StatusCode == HttpStatusCode.NotFound,
                $"{route}: {(int)response.StatusCode}"
            );
            Assert.DoesNotContain("currentVersion", await response.Content.ReadAsStringAsync());
        }
        var chainB = await s.B.PostAsJsonAsync(
            "/api/components",
            new
            {
                type = "chain",
                make = "B",
                model = "B",
            }
        );
        var chainBId = (await chainB.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id")
            .GetGuid();
        var fittedB = await s.B.PostAsJsonAsync(
            "/api/installations",
            new
            {
                bikeId = bikeB,
                componentId = chainBId,
                position = "chain",
                startUtc = ApiScenario.Start,
            }
        );
        var installationB = (await fittedB.Content.ReadFromJsonAsync<JsonElement>())
            .GetProperty("id")
            .GetGuid();
        Assert.Equal(
            HttpStatusCode.NotFound,
            (
                await s.B.PostAsJsonAsync(
                    $"/api/installations/{installationB}/move",
                    new
                    {
                        toBikeId = bike.Id,
                        movedAtUtc = ApiScenario.Start.AddDays(1),
                        expectedInstallationVersion = 1,
                        expectedDestinationInstallationVersion = 1,
                    }
                )
            ).StatusCode
        );
        var overviewB = await s.B.GetStringAsync($"/api/bikes/{bikeB}/overview");
        Assert.DoesNotContain(component.Id.ToString(), overviewB);
        Assert.DoesNotContain(installation.Id.ToString(), overviewB);

        await using var verify = TestDatabase.Open(s.ConnectionString);
        Assert.Null(
            (await verify.PositionExemptions.SingleAsync(x => x.Id == exemption.Id)).EndUtc
        );
        Assert.Equal(1, (await verify.Components.SingleAsync(x => x.Id == component.Id)).Version);
        Assert.Equal(1, await verify.Components.CountAsync(x => x.OwnerId == s.OwnerA));
        Assert.Null((await verify.Installations.SingleAsync(x => x.Id == installation.Id)).EndUtc);
        Assert.Null((await verify.Installations.SingleAsync(x => x.Id == installationB)).EndUtc);
        Assert.Equal(
            "Owner A secret bike",
            (await verify.Bikes.SingleAsync(x => x.Id == bike.Id)).Name
        );
        Assert.Equal(1, (await verify.Rides.SingleAsync(x => x.Id == ride.Id)).Version);
    }
}
