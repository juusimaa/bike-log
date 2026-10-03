using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Domain.Bikes;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class BikeMetadataTests
{
    public static object Metadata(
        string? name = null,
        long expectedVersion = 1,
        string? color = "#aAbB01"
    ) =>
        new
        {
            name,
            make = " Canyon ",
            model = " Grizl 7 ",
            kind = "gravel",
            year = 2026,
            color,
            expectedVersion,
        };

    [Fact]
    public async Task MetadataAndRideNameRoundTrip()
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Create("/api/bikes", Metadata(" My bike "));
        var id = ApiScenario.Id(bike);
        Assert.Equal("My bike", bike.GetProperty("displayName").GetString());
        var response = await s.Client.PutAsJsonAsync($"/api/bikes/{id}", Metadata());
        Assert.Equal(200, (int)response.StatusCode);
        var read = await s.Read($"/api/bikes/{id}");
        Assert.Equal(2, read.GetProperty("version").GetInt64());
        Assert.Equal("Canyon Grizl 7", read.GetProperty("displayName").GetString());
        Assert.Equal("Canyon", read.GetProperty("make").GetString());
        Assert.Equal("Grizl 7", read.GetProperty("model").GetString());
        Assert.Equal("gravel", read.GetProperty("kind").GetString());
        Assert.Equal(2026, read.GetProperty("year").GetInt32());
        Assert.Equal("#aAbB01", read.GetProperty("color").GetString());
    }

    [Theory]
    [InlineData(" Hazy IPA ", "Hazy IPA")]
    [InlineData("#aAbB01", "#aAbB01")]
    [InlineData(" ", null)]
    [InlineData(null, null)]
    public async Task ColorTextRoundTripsOnCreateAndEdit(string? input, string? expected)
    {
        await using var s = await ApiScenario.Open();
        var bike = await s.Create("/api/bikes", Metadata(color: input));
        var id = ApiScenario.Id(bike);
        Assert.Equal(expected, bike.GetProperty("color").GetString());
        Assert.Equal(expected, (await s.Read($"/api/bikes/{id}")).GetProperty("color").GetString());
        var response = await s.Client.PutAsJsonAsync(
            $"/api/bikes/{id}",
            Metadata(color: " Stealth Black ")
        );
        Assert.Equal(200, (int)response.StatusCode);
        Assert.Equal(
            "Stealth Black",
            (await s.Read($"/api/bikes/{id}")).GetProperty("color").GetString()
        );
        response = await s.Client.PutAsJsonAsync(
            $"/api/bikes/{id}",
            Metadata(expectedVersion: 2, color: input)
        );
        Assert.Equal(200, (int)response.StatusCode);
        Assert.Equal(expected, (await s.Read($"/api/bikes/{id}")).GetProperty("color").GetString());
    }

    [Fact]
    public async Task StaleBikeEditChangesNothing()
    {
        await using var s = await ApiScenario.Open();
        var id = ApiScenario.Id(await s.Create("/api/bikes", Metadata("Original")));
        var before = await s.Read($"/api/bikes/{id}");
        var response = await s.Client.PutAsJsonAsync(
            $"/api/bikes/{id}",
            new
            {
                name = "Changed",
                make = "Trek",
                model = "Domane",
                kind = "road",
                year = 2025,
                color = "#123456",
                expectedVersion = 0,
            }
        );
        Assert.Equal(409, (int)response.StatusCode);
        Assert.Equal(
            1,
            (await response.Content.ReadFromJsonAsync<JsonElement>())
                .GetProperty("currentVersion")
                .GetInt64()
        );
        var after = await s.Read($"/api/bikes/{id}");
        Assert.Equal(before.GetRawText(), after.GetRawText());
        await using var db = TestDatabase.Open(s.ConnectionString);
        var other = new Bike { OwnerId = Guid.NewGuid(), Name = "Private" };
        db.Bikes.Add(other);
        await db.SaveChangesAsync();
        Assert.Equal(
            404,
            (int)(await s.Client.PutAsJsonAsync($"/api/bikes/{other.Id}", Metadata())).StatusCode
        );
    }

    [Fact]
    public async Task LegacyBikeRemainsReadable()
    {
        await using var s = await ApiScenario.Open();
        await using var db = TestDatabase.Open(s.ConnectionString);
        var bike = new Bike { OwnerId = ApiScenario.Owner, Name = "Legacy" };
        db.Bikes.Add(bike);
        await db.SaveChangesAsync();
        var read = await s.Read($"/api/bikes/{bike.Id}");
        Assert.Equal("Legacy", read.GetProperty("displayName").GetString());
        Assert.Equal(JsonValueKind.Null, read.GetProperty("make").ValueKind);
    }

    [Fact]
    public async Task MetadataValidationRejectsInvalidValues()
    {
        await using var s = await ApiScenario.Open();
        Assert.Equal(
            400,
            (int)(await s.Client.PostAsJsonAsync("/api/bikes", new { name = "Missing" })).StatusCode
        );
        foreach (var field in new[] { "name", "make", "model", "kind", "year", "color" })
        {
            foreach (
                var value in field == "year" ? new object[] { 1899, 10000 }
                : field == "kind" ? new object[] { "invalid" }
                : new object[] { new string('x', 101) }
            )
            {
                var body = new Dictionary<string, object?>
                {
                    ["name"] = null,
                    ["make"] = "Canyon",
                    ["model"] = "Grizl 7",
                    ["kind"] = "gravel",
                    ["year"] = 2026,
                    ["color"] = null,
                };
                body[field] = value;
                Assert.Equal(
                    400,
                    (int)(await s.Client.PostAsJsonAsync("/api/bikes", body)).StatusCode
                );
            }
        }
    }
}
