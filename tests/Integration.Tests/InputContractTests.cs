using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class InputContractTests
{
    [Fact]
    public async Task MissingRequiredInstantsRejectWithoutSaving()
    {
        await using var s = await ApiScenario.Open();
        var e = await s.Equipment();
        var ride = await s.Client.PostAsJsonAsync(
            "/api/rides",
            new { bikeId = e.Bike, distanceMetres = 100 }
        );
        Assert.Equal(400, (int)ride.StatusCode);
        var maintenance = await s.Client.PostAsJsonAsync(
            "/api/maintenance",
            new { bikeId = e.Bike, task = "Inspect" }
        );
        Assert.Equal(400, (int)maintenance.StatusCode);
        var chain = await s.Chain();
        var install = await s.Client.PostAsJsonAsync(
            "/api/installations",
            new
            {
                bikeId = e.Bike,
                componentId = chain,
                position = "chain",
            }
        );
        Assert.Equal(400, (int)install.StatusCode);
        var edit = await s.Client.PutAsJsonAsync(
            $"/api/installations/{e.Installation}",
            new { expectedVersion = 1 }
        );
        Assert.Equal(400, (int)edit.StatusCode);
        var r = await s.Client.PostAsJsonAsync(
            $"/api/installations/{e.Installation}/replacement",
            new { newComponentId = chain, expectedInstallationVersion = 1 }
        );
        Assert.Equal(400, (int)r.StatusCode);
        await using var db = TestDatabase.Open(s.ConnectionString);
        Assert.Empty(db.Rides);
        Assert.Empty(db.MaintenanceRecords);
        Assert.Equal(ApiScenario.Start, db.Installations.Single().StartUtc);
    }

    [Theory]
    [InlineData("/api/rides", "{bad")]
    [InlineData("/api/rides", "null")]
    [InlineData("/api/rides", "{\"distanceMetres\":\"not-a-number\"}")]
    public async Task MalformedBodiesReturnSanitizedProblemDetails(string path, string body)
    {
        await using var s = await ApiScenario.Open();
        var r = await s.Client.PostAsync(
            path,
            new StringContent(body, System.Text.Encoding.UTF8, "application/json")
        );
        await AssertProblem(r);
    }

    [Fact]
    public async Task InvalidVersionQueryReturnsSanitizedProblemDetails()
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
                    distanceMetres = 100,
                }
            )
        );
        await AssertProblem(await s.Client.DeleteAsync($"/api/rides/{ride}?expectedVersion=bad"));
        await AssertProblem(await s.Client.DeleteAsync($"/api/rides/{ride}"));
    }

    private static async Task AssertProblem(HttpResponseMessage r)
    {
        Assert.Equal(400, (int)r.StatusCode);
        Assert.Equal("application/problem+json", r.Content.Headers.ContentType?.MediaType);
        var text = await r.Content.ReadAsStringAsync();
        var p = JsonDocument.Parse(text).RootElement;
        Assert.Equal("invalid_input", p.GetProperty("code").GetString());
        Assert.False(p.TryGetProperty("exception", out _));
        Assert.DoesNotContain("Exception", text);
        Assert.DoesNotContain("StackTrace", text);
        Assert.DoesNotContain("/Users/", text);
    }
}
