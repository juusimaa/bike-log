using System.Net.Http.Json;
using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class ComponentMetadataTests
{
    [Theory]
    [InlineData("chain")]
    [InlineData("cassette")]
    [InlineData("tyre")]
    public async Task MakeAndModelRoundTrip(string type)
    {
        await using var s = await ApiScenario.Open();
        var part = await s.Create(
            "/api/components",
            new
            {
                type,
                make = " Campagnolo ",
                model = " Ekar C13 C-Link 13-speed ",
            }
        );
        var id = ApiScenario.Id(part);
        foreach (var response in new[] { part, await s.Read($"/api/components/{id}") })
        {
            Assert.Equal("Campagnolo", response.GetProperty("make").GetString());
            Assert.Equal("Ekar C13 C-Link 13-speed", response.GetProperty("model").GetString());
        }
        var collection = await s.Read("/api/components");
        Assert.Equal(
            "Campagnolo",
            collection.GetProperty("items")[0].GetProperty("make").GetString()
        );
    }

    [Fact]
    public async Task MakeIsRequiredAndBounded()
    {
        await using var s = await ApiScenario.Open();
        Assert.Equal(
            400,
            (int)
                (
                    await s.Client.PostAsJsonAsync(
                        "/api/components",
                        new { type = "chain", model = "Ekar" }
                    )
                ).StatusCode
        );
        foreach (var make in new[] { null, "", "  ", new string('x', 101) })
        {
            Assert.Equal(
                400,
                (int)
                    (
                        await s.Client.PostAsJsonAsync(
                            "/api/components",
                            new
                            {
                                type = "chain",
                                make,
                                model = "Ekar",
                            }
                        )
                    ).StatusCode
            );
        }
    }
}
