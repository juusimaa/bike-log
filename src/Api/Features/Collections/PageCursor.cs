using System.Text.Json;
using BikeLog.Api.Features.Errors;
using Microsoft.AspNetCore.WebUtilities;

namespace BikeLog.Api.Features.Collections;

public sealed record CursorPosition(Guid Id, DateTimeOffset? Instant);

public static class PageCursor
{
    public static string Encode(string scope, Guid id, DateTimeOffset? instant) =>
        WebEncoders.Base64UrlEncode(
            JsonSerializer.SerializeToUtf8Bytes(
                new
                {
                    version = 1,
                    scope,
                    id,
                    instant,
                }
            )
        );

    public static CursorPosition Decode(string token, string scope)
    {
        ApiInput.Require(token.Length is > 0 and <= 2048, "Invalid cursor.");
        try
        {
            ApiInput.Require(
                token.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_'),
                "Invalid cursor."
            );
            using var json = JsonDocument.Parse(WebEncoders.Base64UrlDecode(token));
            var root = json.RootElement;
            ApiInput.Require(
                root.ValueKind == JsonValueKind.Object && root.EnumerateObject().Count() == 4,
                "Invalid cursor."
            );
            ApiInput.Require(
                root.GetProperty("version").GetInt32() == 1
                    && root.GetProperty("scope").GetString() == scope,
                "Invalid cursor scope."
            );
            var id = root.GetProperty("id").GetGuid();
            var time = root.GetProperty("instant");
            DateTimeOffset? instant =
                time.ValueKind == JsonValueKind.Null ? null : time.GetDateTimeOffset();
            ApiInput.Require(
                instant == null
                    || (instant.Value.Offset == TimeSpan.Zero && instant.Value.Ticks % 10 == 0),
                "Invalid cursor instant."
            );
            return new(id, instant);
        }
        catch (Exception ex)
            when (ex
                    is JsonException
                        or FormatException
                        or InvalidOperationException
                        or KeyNotFoundException
                        or OverflowException
            )
        {
            ApiInput.Require(false, "Invalid cursor.");
            throw;
        }
    }
}
