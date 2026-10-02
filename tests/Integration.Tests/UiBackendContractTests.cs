using BikeLog.Integration.Tests.Fixtures;

namespace BikeLog.Integration.Tests;

public class UiBackendContractTests
{
    [Fact]
    public async Task OpenApiNullableEnumsAcceptNullAndRequiredBikeKindDoesNot()
    {
        await using var scenario = await ApiScenario.Open();
        var api = await scenario.Read("/openapi/v1.json");
        var schemas = api.GetProperty("components").GetProperty("schemas");
        foreach (
            var (schema, property) in new[]
            {
                ("BikeResponse", "kind"),
                ("EditReminder", "method"),
                ("ReminderEvaluation", "method"),
            }
        )
        {
            var field = schemas.GetProperty(schema).GetProperty("properties").GetProperty(property);
            Assert.Contains(
                field.GetProperty("enum").EnumerateArray(),
                x => x.ValueKind == System.Text.Json.JsonValueKind.Null
            );
        }
        var required = schemas
            .GetProperty("CreateBike")
            .GetProperty("properties")
            .GetProperty("kind");
        Assert.DoesNotContain(
            required.GetProperty("enum").EnumerateArray(),
            x => x.ValueKind == System.Text.Json.JsonValueKind.Null
        );
        Assert.Equal("string", required.GetProperty("type").GetString());
    }

    [Fact]
    public async Task ApiOnlyDraftWorkflowReloadsWithoutFixtureIds()
    {
        await using var scenario = await ApiScenario.Open();
        var marker = "Synthetic reload " + Guid.NewGuid();
        for (var n = 0; n < 2; n++)
        {
            await scenario.Create(
                "/api/bikes",
                new
                {
                    name = marker + n,
                    make = "Synthetic",
                    model = "Draft",
                    kind = "gravel",
                    year = 2026,
                }
            );
        }
        var found = new List<System.Text.Json.JsonElement>();
        string? cursor = null;
        do
        {
            var page = await scenario.Read(
                "/api/bikes?pageSize=1"
                    + (cursor is null ? "" : "&cursor=" + Uri.EscapeDataString(cursor))
            );
            found.AddRange(page.GetProperty("items").EnumerateArray().Select(x => x.Clone()));
            cursor = page.GetProperty("nextCursor").GetString();
        } while (cursor is not null);
        Assert.Equal(2, found.Count(x => x.GetProperty("name").GetString()!.StartsWith(marker)));
        foreach (var bike in found)
        {
            var id = bike.GetProperty("id").GetGuid();
            await scenario.Create(
                "/api/rides",
                new
                {
                    bikeId = id,
                    name = marker + " ride",
                    startUtc = ApiScenario.Start,
                    distanceMetres = 65000,
                }
            );
            var rides = await scenario.Read($"/api/bikes/{id}/rides?pageSize=1");
            var ride = Assert.Single(rides.GetProperty("items").EnumerateArray());
            Assert.Equal(marker + " ride", ride.GetProperty("name").GetString());
            Assert.Equal(65000, ride.GetProperty("distanceMetres").GetInt64());
            Assert.Equal(
                System.Text.Json.JsonValueKind.Null,
                ride.GetProperty("durationSeconds").ValueKind
            );
        }
    }

    [Fact]
    public async Task RideDeleteAdvertises204()
    {
        await using var scenario = await ApiScenario.Open();
        var api = await scenario.Read("/openapi/v1.json");
        Assert.True(
            api.GetProperty("paths")
                .GetProperty("/api/rides/{id}")
                .GetProperty("delete")
                .GetProperty("responses")
                .TryGetProperty("204", out _)
        );
    }

    [Fact]
    public async Task OpenApiDescribesCollectionParameters()
    {
        await using var scenario = await ApiScenario.Open();
        var api = await scenario.Read("/openapi/v1.json");
        var paths = api.GetProperty("paths");
        foreach (
            var route in new[]
            {
                "/api/bikes",
                "/api/components",
                "/api/bikes/{id}/rides",
                "/api/bikes/{id}/installations",
                "/api/components/{id}/maintenance",
            }
        )
        {
            var parameters = paths
                .GetProperty(route)
                .GetProperty("get")
                .GetProperty("parameters")
                .EnumerateArray()
                .ToArray();
            var size = parameters
                .Single(p => p.GetProperty("name").GetString() == "pageSize")
                .GetProperty("schema");
            Assert.Equal(50, size.GetProperty("default").GetInt32());
            Assert.Equal(1, size.GetProperty("minimum").GetInt32());
            Assert.Equal(200, size.GetProperty("maximum").GetInt32());
            var cursor = parameters
                .Single(p => p.GetProperty("name").GetString() == "cursor")
                .GetProperty("description")
                .GetString();
            Assert.Contains("route, parent and filter", cursor);
            Assert.Contains("Refresh the collection after mutations", cursor);
            if (route.EndsWith("installations"))
            {
                var status = parameters
                    .Single(p => p.GetProperty("name").GetString() == "status")
                    .GetProperty("schema");
                Assert.Equal("current", status.GetProperty("default").GetString());
                Assert.Equal(
                    new[] { "current", "all" },
                    status.GetProperty("enum").EnumerateArray().Select(x => x.GetString())
                );
            }
        }
    }

    [Fact]
    public async Task OpenApiRequiresEveryReplacementResponseMember()
    {
        await using var scenario = await ApiScenario.Open();
        var api = await scenario.Read("/openapi/v1.json");
        var response = api.GetProperty("components")
            .GetProperty("schemas")
            .GetProperty("ReplacementWithServiceResponse");
        Assert.Equal(
            new[] { "component", "maintenance", "newInstallation", "oldInstallation" },
            response.GetProperty("required").EnumerateArray().Select(x => x.GetString()).Order()
        );
    }

    [Fact]
    public async Task OpenApiDescribesEveryNewRoute()
    {
        await using var scenario = await ApiScenario.Open();
        var api = await scenario.Read("/openapi/v1.json");
        var paths = api.GetProperty("paths");
        var schemas = api.GetProperty("components").GetProperty("schemas");
        var bike = schemas.GetProperty("CreateBike");
        Assert.Equal(
            new[] { "kind", "make", "model", "year" },
            bike.GetProperty("required").EnumerateArray().Select(x => x.GetString()).Order()
        );
        Assert.Equal(
            new[] { "gravel", "road", "mountain", "hybrid", "other" },
            bike.GetProperty("properties")
                .GetProperty("kind")
                .GetProperty("enum")
                .EnumerateArray()
                .Select(x => x.GetString())
        );
        Assert.Contains(
            "Integer metres",
            schemas
                .GetProperty("CreateRide")
                .GetProperty("properties")
                .GetProperty("distanceMetres")
                .GetProperty("description")
                .GetString()
        );
        Assert.Contains(
            "Integer seconds",
            schemas
                .GetProperty("CreateRide")
                .GetProperty("properties")
                .GetProperty("durationSeconds")
                .GetProperty("description")
                .GetString()
        );
        Assert.Equal(
            new string?[] { "oil", "wax", null },
            schemas
                .GetProperty("EditReminder")
                .GetProperty("properties")
                .GetProperty("method")
                .GetProperty("enum")
                .EnumerateArray()
                .Select(x => x.GetString())
        );
        var page = schemas.GetProperty("PageResponseOfBikeResponse").GetProperty("properties");
        Assert.Equal("array", page.GetProperty("items").GetProperty("type").GetString());
        Assert.True(page.TryGetProperty("nextCursor", out _));
        Assert.True(
            paths
                .GetProperty("/api/bikes")
                .GetProperty("post")
                .GetProperty("responses")
                .TryGetProperty("201", out _)
        );
        Assert.True(
            paths
                .GetProperty("/api/installations/{id}/replacement-with-service")
                .GetProperty("post")
                .GetProperty("responses")
                .TryGetProperty("200", out _)
        );
        foreach (
            var route in new[]
            {
                "/api/bikes",
                "/api/components",
                "/api/bikes/{id}/rides",
                "/api/bikes/{id}/installations",
                "/api/components/{id}/maintenance",
                "/api/installations/{id}/replacement-with-service",
                "/api/components/{id}/estimate",
                "/api/bikes/{id}/reminder",
                "/api/bikes/{id}/overview",
            }
        )
        {
            Assert.True(paths.TryGetProperty(route, out _), route);
        }
        foreach (var route in paths.EnumerateObject().Where(x => x.Name.StartsWith("/api/")))
        {
            foreach (
                var operation in route
                    .Value.EnumerateObject()
                    .Where(x => new[] { "get", "post", "put", "delete" }.Contains(x.Name))
            )
            {
                foreach (var code in new[] { "400", "404", "409", "500", "503" })
                {
                    Assert.True(
                        operation.Value.GetProperty("responses").TryGetProperty(code, out _),
                        route.Name + " " + code
                    );
                }
            }
        }
    }
}
