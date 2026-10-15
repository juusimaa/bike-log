using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Integration.Tests.Fixtures;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Integration.Tests;

public class BikeDeletionTests
{
    private static readonly string[] Positions =
    [
        "chain",
        "cassette",
        "saddle",
        "front-rim",
        "rear-rim",
    ];

    private sealed record Setup(Guid Bike, Dictionary<string, Guid> Parts, Guid Ride);

    private static async Task<Setup> FiveParts(ApiScenario s, string name = "Synthetic B")
    {
        var bike = await s.Bike(name);
        var parts = new Dictionary<string, Guid>();
        foreach (var position in Positions)
        {
            var type = position switch
            {
                "front-rim" or "rear-rim" => "rim",
                _ => position,
            };
            var part = ApiScenario.Id(await s.Part(type, model: $"Synthetic {position}"));
            await s.Fit(bike, part, position);
            parts[position] = part;
        }
        var ride = ApiScenario.Id(await s.Ride(bike, ApiScenario.Start.AddDays(1), 42000));
        await s.Create(
            "/api/maintenance",
            new
            {
                bikeId = bike,
                componentId = parts["chain"],
                task = "Clean chain",
                performedUtc = ApiScenario.Start.AddDays(2),
            }
        );
        var reminder = await s.Client.PutAsJsonAsync(
            $"/api/bikes/{bike}/reminder",
            new
            {
                enabled = true,
                method = "oil",
                oilThresholdMetres = 300000,
                waxThresholdMetres = 300000,
                expectedVersion = 0,
            }
        );
        Assert.Equal(200, (int)reminder.StatusCode);
        return new(bike, parts, ride);
    }

    private static Task<HttpResponseMessage> Delete(
        ApiScenario s,
        Guid bike,
        long version,
        IEnumerable<Guid> installations,
        IEnumerable<Guid> keep
    ) =>
        s.Client.PostAsJsonAsync(
            $"/api/bikes/{bike}/delete",
            new
            {
                expectedVersion = version,
                fittedInstallationIds = installations.ToArray(),
                keepComponentIds = keep.ToArray(),
            }
        );

    private static Guid[] InstallationIds(JsonElement preview) =>
        preview
            .GetProperty("fittedParts")
            .EnumerateArray()
            .Select(x => x.GetProperty("installationId").GetGuid())
            .ToArray();

    [Fact]
    public async Task DeletingABikeKeepsChosenPartsAsSparesAndItsRidesByName()
    {
        await using var s = await ApiScenario.Open();
        var b = await FiveParts(s);
        var preview = await s.Read($"/api/bikes/{b.Bike}/deletion-preview");
        Assert.Equal(1, preview.GetProperty("bikeVersion").GetInt64());
        Assert.Equal(1, preview.GetProperty("rideCount").GetInt32());
        Assert.Equal(1, preview.GetProperty("maintenanceCount").GetInt32());
        var fitted = preview.GetProperty("fittedParts").EnumerateArray().ToArray();
        Assert.Equal(5, fitted.Length);
        Assert.Equal(
            Positions.Order(),
            fitted.Select(x => x.GetProperty("position").GetString()!).Order()
        );
        var rim = fitted.Single(x => x.GetProperty("position").GetString() == "front-rim");
        Assert.Equal("rim", rim.GetProperty("type").GetString());
        Assert.Equal("Synthetic", rim.GetProperty("make").GetString());
        Assert.Equal("Synthetic front-rim", rim.GetProperty("model").GetString());
        Assert.Equal(b.Parts["front-rim"], rim.GetProperty("componentId").GetGuid());

        var keep = new[] { b.Parts["front-rim"], b.Parts["rear-rim"] };
        var kept = new Dictionary<Guid, long>();
        foreach (var id in keep)
        {
            kept[id] = await s.Lifetime(id);
        }
        Assert.All(kept.Values, x => Assert.Equal(42000, x));

        Assert.Equal(
            204,
            (int)(await Delete(s, b.Bike, 1, InstallationIds(preview), keep)).StatusCode
        );

        await ApiScenario.Expect(await s.Client.GetAsync($"/api/bikes/{b.Bike}"), 404, "not_found");
        Assert.DoesNotContain(
            (await s.Read("/api/bikes")).GetProperty("items").EnumerateArray(),
            x => ApiScenario.Id(x) == b.Bike
        );
        foreach (var id in keep)
        {
            Assert.Equal(kept[id], await s.Lifetime(id));
            var part = await s.Read($"/api/components/{id}");
            var history = part.GetProperty("installations").EnumerateArray().Single();
            Assert.NotEqual(JsonValueKind.Null, history.GetProperty("endUtc").ValueKind);
            var bike = part.GetProperty("bikes").EnumerateArray().Single();
            Assert.Equal("deleted", bike.GetProperty("state").GetString());
            Assert.Equal("Synthetic B", bike.GetProperty("displayName").GetString());
        }
        foreach (var position in new[] { "chain", "cassette", "saddle" })
        {
            await ApiScenario.Expect(
                await s.Client.GetAsync($"/api/components/{b.Parts[position]}"),
                404,
                "not_found"
            );
        }
        var listed = (await s.Read("/api/rides")).GetProperty("items").EnumerateArray().Single();
        Assert.Equal(b.Ride, ApiScenario.Id(listed));
        Assert.Equal("deleted", listed.GetProperty("bike").GetProperty("state").GetString());
        Assert.Equal(
            "Synthetic B",
            listed.GetProperty("bike").GetProperty("displayName").GetString()
        );
        await using var db = TestDatabase.Open(s.ConnectionString);
        Assert.False(await db.MaintenanceRecords.AnyAsync(x => x.BikeId == b.Bike));
        Assert.False(await db.ChainLubricationRules.AnyAsync(x => x.BikeId == b.Bike));
        Assert.False(await db.PositionExemptions.AnyAsync(x => x.BikeId == b.Bike));
        var tombstone = await db.Bikes.IgnoreQueryFilters().SingleAsync(x => x.Id == b.Bike);
        Assert.True(tombstone.IsDeleted);
        Assert.Null(tombstone.Make);
        Assert.Equal(2, tombstone.Version);
    }

    [Fact]
    public async Task MovingARideOfADeletedBikeShiftsUsageFromTheKeptParts()
    {
        await using var s = await ApiScenario.Open();
        var (a, chainA, _) = await s.Equipment();
        var b = await FiveParts(s);
        var preview = await s.Read($"/api/bikes/{b.Bike}/deletion-preview");
        var keep = new[] { b.Parts["front-rim"], b.Parts["rear-rim"] };
        Assert.Equal(
            204,
            (int)(await Delete(s, b.Bike, 1, InstallationIds(preview), keep)).StatusCode
        );
        var moved = await s.Client.PutAsJsonAsync(
            $"/api/rides/{b.Ride}",
            new
            {
                bikeId = a,
                startUtc = ApiScenario.Start.AddDays(1),
                distanceMetres = 42000,
                expectedVersion = 1,
            }
        );
        Assert.Equal(200, (int)moved.StatusCode);
        Assert.Equal(42000, await s.Lifetime(chainA));
        foreach (var id in keep)
        {
            Assert.Equal(0, await s.Lifetime(id));
        }
        // A deleted bike can no longer be a move's destination.
        await ApiScenario.Expect(
            await s.Client.PutAsJsonAsync(
                $"/api/rides/{b.Ride}",
                new
                {
                    bikeId = b.Bike,
                    startUtc = ApiScenario.Start.AddDays(1),
                    distanceMetres = 42000,
                    expectedVersion = 2,
                }
            ),
            404,
            "not_found"
        );
    }

    [Fact]
    public async Task ChangedPartsOrVersionRejectTheDeletionAndChangeNothing()
    {
        await using var s = await ApiScenario.Open();
        var b = await FiveParts(s);
        var preview = await s.Read($"/api/bikes/{b.Bike}/deletion-preview");
        var seen = InstallationIds(preview);

        var renamed = await s.Client.PutAsJsonAsync(
            $"/api/bikes/{b.Bike}",
            new
            {
                name = "Synthetic B2",
                make = "Synthetic",
                model = "Frame",
                kind = "road",
                year = 2026,
                expectedVersion = 1,
            }
        );
        Assert.Equal(200, (int)renamed.StatusCode);
        await ApiScenario.Expect(await Delete(s, b.Bike, 1, seen, []), 409, "stale_version");

        // A part fitted after the preview changes the set the owner decided about.
        var pedals = ApiScenario.Id(await s.Part("pedals"));
        await s.Fit(b.Bike, pedals, "pedals");
        var changed = await ApiScenario.Expect(
            await Delete(s, b.Bike, 2, seen, []),
            409,
            "bike_parts_changed"
        );
        var fresh = changed.GetProperty("preview");
        Assert.Equal(6, fresh.GetProperty("fittedParts").GetArrayLength());
        Assert.Equal(2, fresh.GetProperty("bikeVersion").GetInt64());

        await ApiScenario.Expect(
            await Delete(s, b.Bike, 2, InstallationIds(fresh), [Guid.NewGuid()]),
            400,
            "invalid_input"
        );

        Assert.Equal(
            "Synthetic B2",
            (await s.Read($"/api/bikes/{b.Bike}")).GetProperty("name").GetString()
        );
        foreach (var part in b.Parts.Values.Append(pedals))
        {
            Assert.Equal(200, (int)(await s.Client.GetAsync($"/api/components/{part}")).StatusCode);
        }
        Assert.Equal(42000, await s.Lifetime(b.Parts["chain"]));
        Assert.Equal(
            1,
            (await s.Read($"/api/bikes/{b.Bike}/deletion-preview"))
                .GetProperty("maintenanceCount")
                .GetInt32()
        );
    }

    [Fact]
    public async Task UnreferencedOrRetiredBikesAreDeletedToo()
    {
        await using var s = await ApiScenario.Open();
        var empty = await s.Bike("Synthetic empty");
        var saddle = ApiScenario.Id(await s.Part("saddle"));
        await s.Fit(empty, saddle, "saddle");
        var preview = await s.Read($"/api/bikes/{empty}/deletion-preview");
        Assert.Equal(0, preview.GetProperty("rideCount").GetInt32());
        Assert.Equal(
            204,
            (int)(await Delete(s, empty, 1, InstallationIds(preview), [])).StatusCode
        );
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            Assert.False(await db.Bikes.IgnoreQueryFilters().AnyAsync(x => x.Id == empty));
        }

        var retired = await FiveParts(s, "Synthetic retired");
        await AllRidesApiTests.SetStatus(s, retired.Bike, "retired", 1);
        var retiredPreview = await s.Read($"/api/bikes/{retired.Bike}/deletion-preview");
        Assert.Equal(2, retiredPreview.GetProperty("bikeVersion").GetInt64());
        Assert.Equal(
            204,
            (int)(await Delete(s, retired.Bike, 2, InstallationIds(retiredPreview), [])).StatusCode
        );
        await using (var db = TestDatabase.Open(s.ConnectionString))
        {
            var tombstone = await db
                .Bikes.IgnoreQueryFilters()
                .SingleAsync(x => x.Id == retired.Bike);
            Assert.True(tombstone.IsDeleted);
            Assert.Equal(BikeStatus.Retired, tombstone.Status);
        }
        await ApiScenario.Expect(
            await s.Client.GetAsync($"/api/bikes/{Guid.NewGuid()}/deletion-preview"),
            404,
            "not_found"
        );
        await ApiScenario.Expect(await Delete(s, Guid.NewGuid(), 1, [], []), 404, "not_found");
    }
}
