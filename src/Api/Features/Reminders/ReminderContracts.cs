using System.Text.Json.Serialization;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Reminders;

namespace BikeLog.Api.Features.Reminders;

public sealed record EditReminder(
    [property: JsonRequired] bool Enabled,
    string? Method,
    long? OilThresholdMetres,
    long? WaxThresholdMetres,
    [property: JsonRequired] long ExpectedVersion
)
{
    public LubricationMethod? ParseMethod() =>
        Method switch
        {
            null => null,
            "oil" => LubricationMethod.Oil,
            "wax" => LubricationMethod.Wax,
            _ => throw new ApiException(400, "invalid_input", "Unknown lubrication method."),
        };
}
