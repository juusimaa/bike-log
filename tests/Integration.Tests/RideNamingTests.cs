using System.Net.Http.Json;
using System.Text.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class RideNamingTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("   ")]
    [InlineData("Morning ride")]
    public async Task RideNamesRoundTrip(string? name)
    {
        await using var s = await ApiScenario.Open();
        var bike = ApiScenario.Id(await s.Create("/api/bikes", BikeMetadataTests.Metadata()));
        var ride = await s.Create(
            "/api/rides",
            new
            {
                bikeId = bike,
                startUtc = ApiScenario.Start,
                distanceMetres = 1000,
                name,
            }
        );
        Assert.Equal(
            string.IsNullOrWhiteSpace(name) ? null : name,
            ride.GetProperty("name").GetString()
        );
        var id = ApiScenario.Id(ride);
        var response = await s.Client.PutAsJsonAsync(
            $"/api/rides/{id}",
            new
            {
                bikeId = bike,
                startUtc = ApiScenario.Start,
                distanceMetres = 1000,
                expectedVersion = 1,
                name = new string('x', 100),
            }
        );
        Assert.Equal(200, (int)response.StatusCode);
        Assert.Equal(
            new string('x', 100),
            (await s.Read($"/api/rides/{id}")).GetProperty("name").GetString()
        );
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.PostAsJsonAsync(
                        "/api/rides",
                        new
                        {
                            bikeId = bike,
                            startUtc = ApiScenario.Start,
                            distanceMetres = 1000,
                            name = new string('x', 101),
                        }
                    )
                ).StatusCode
        );
    }
}
