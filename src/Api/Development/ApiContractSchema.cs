using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace BikeLog.Api.Development;

public static class ApiContractSchema
{
    public static Task Describe(
        OpenApiSchema schema,
        OpenApiSchemaTransformerContext context,
        CancellationToken ct
    )
    {
        var type = context.JsonTypeInfo.Type;
        if (
            type.Namespace?.StartsWith("BikeLog.Api.Features") == true
            && (
                type.Name.StartsWith("Create")
                || type.Name.StartsWith("Edit")
                || type.Name.StartsWith("Correct")
                || type.Name is "ReplaceInstallation" or "ReplaceWithService"
            )
        )
        {
            schema.Required = type.GetProperties()
                .Where(p => Attribute.IsDefined(p, typeof(JsonRequiredAttribute)))
                .Select(p => char.ToLowerInvariant(p.Name[0]) + p.Name[1..])
                .ToHashSet();
        }
        if (schema.Properties is not null)
        {
            foreach (var (name, property) in schema.Properties)
            {
                if (property is not OpenApiSchema field)
                {
                    continue;
                }
                if (name.EndsWith("Metres"))
                {
                    field.Description =
                        "Integer metres; estimates are separate from recorded usage.";
                }
                if (name.EndsWith("Seconds"))
                {
                    field.Description = "Integer seconds; null duration means unknown.";
                }
                string[]? values = name switch
                {
                    "kind" when type.Name.Contains("Bike") =>
                    [
                        "gravel",
                        "road",
                        "mountain",
                        "hybrid",
                        "other",
                    ],
                    "type" when type.Name.Contains("Component") => ["chain", "cassette", "tyre"],
                    "position" => ["chain", "cassette", "front-tyre", "rear-tyre"],
                    "method" => ["oil", "wax"],
                    _ => null,
                };
                if (values is not null)
                {
                    field.Enum = values.Select(x => (JsonNode)JsonValue.Create(x)!).ToList();
                    var requestProperty = type.GetProperties()
                        .FirstOrDefault(p =>
                            string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase)
                        );
                    if (
                        requestProperty is not null
                        && Attribute.IsDefined(requestProperty, typeof(JsonRequiredAttribute))
                    )
                    {
                        field.Type &= ~JsonSchemaType.Null;
                    }
                    else if ((field.Type & JsonSchemaType.Null) != 0)
                    {
                        field.Enum.Add(null!);
                    }
                }
            }
        }
        return Task.CompletedTask;
    }
}
