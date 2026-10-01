namespace BikeLog.Api.Features.Errors;
/// <summary>Binding happens before endpoint filters; keep all request errors sanitized.</summary>
public sealed class RequestErrorMiddleware(RequestDelegate next, ILogger<RequestErrorMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { context.Abort(); }
        catch (Exception error)
        {
            if (context.Response.HasStarted)
            {
                context.Abort();
                return;
            }
            var bad = error is BadHttpRequestException;
            if (!bad)
            {
                logger.LogError("Unhandled local request failure. Returning a sanitized error.");
            }

            context.Response.Clear();
            await Results.Problem(statusCode: bad ? 400 : 500, title: bad ? "invalid_input" : "request_failed", detail: bad ? "The request body or parameters are invalid. Supply all required fields and timestamps with an explicit offset and whole-microsecond precision." : "The request could not be completed.", extensions: new Dictionary<string, object?> { { "code", bad ? "invalid_input" : "request_failed" } }).ExecuteAsync(context);
        }
    }
}
