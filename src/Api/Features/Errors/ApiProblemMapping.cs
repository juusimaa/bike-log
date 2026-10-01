using BikeLog.Domain;
using Microsoft.EntityFrameworkCore;
using Npgsql;
namespace BikeLog.Api.Features.Errors;

public sealed class ApiException(int status, string code, string message, long? currentVersion = null) : Exception(message)
{ public int Status { get; } = status; public string Code { get; } = code; public long? CurrentVersion { get; } = currentVersion; }
public sealed class ApiProblemMapping : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        try { return await next(context); }
        catch (ApiException e) { return Problem(e.Status, e.Code, e.Message, e.CurrentVersion); }
        catch (DomainValidationException e) { return Problem(e.Code == "installation_overlap" ? 409 : 400, e.Code, e.Message); }
        catch (DbUpdateConcurrencyException) { return Problem(409, "stale_version", "The record changed. Reload it and retry your edit."); }
        catch (OverflowException) { return Problem(400, "usage_overflow", "The requested values exceed supported usage totals."); }
        catch (DbUpdateException) { return Problem(500, "persistence_failed", "The edit could not be saved. No changes were committed."); }
        catch (NpgsqlException) { return Problem(503, "database_unavailable", "The local database is unavailable. Retry when it is ready."); }
        catch (InvalidOperationException) { return Problem(500, "calculation_failed", "The edit could not be completed. No changes were committed."); }
    }
    private static IResult Problem(int status, string code, string detail, long? version = null)
    { var extensions = new Dictionary<string, object?> { { "code", code } }; if (version.HasValue) extensions["currentVersion"] = version; return Results.Problem(statusCode: status, title: code, detail: detail, extensions: extensions); }
}
public static class ApiInput
{
    public static void Require(bool valid, string message) { if (!valid) throw new ApiException(400, "invalid_input", message); }
    public static string Text(string? value, string field) { Require(!string.IsNullOrWhiteSpace(value), $"{field} must not be blank."); return value!.Trim(); }
    public static void Version(long supplied, long current) { if (supplied != current) throw new ApiException(409, "stale_version", "The record changed. Reload it and retry your edit.", current); }
    public static ApiException Missing() => new(404, "not_found", "The requested record was not found.");
}
