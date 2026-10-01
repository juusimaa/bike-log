using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
namespace BikeLog.Api.Features.Errors;
/// <summary>All accepted instants round-trip exactly through PostgreSQL microsecond timestamps.</summary>
public sealed class UtcInstantConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String) throw new JsonException("An offset timestamp is required.");
        var text = reader.GetString();
        if (text == null || !Regex.IsMatch(text, @"(?:Z|[+-]\d{2}:\d{2})$") || !reader.TryGetDateTimeOffset(out var value)) throw new JsonException("An ISO timestamp with an explicit offset is required.");
        var utc = value.ToUniversalTime();
        if (utc == DateTimeOffset.MinValue || utc == DateTimeOffset.MaxValue || utc.Ticks % 10 != 0) throw new JsonException("Timestamp precision must be whole microseconds and finite.");
        return utc;
    }
    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) => writer.WriteStringValue(value.ToUniversalTime());
}
