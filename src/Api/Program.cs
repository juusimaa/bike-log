using BikeLog.Api.Development;
using Npgsql;
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IDevelopmentOwner, DevelopmentOwner>();
builder.Services.AddOpenApi();
var app = builder.Build();
DevelopmentAccess.Validate(app.Environment, app.Configuration);
var connection = app.Configuration.GetConnectionString("Postgres")!;
app.Use(async (context,next) => {
    if (context.Connection.RemoteIpAddress is { } ip && !System.Net.IPAddress.IsLoopback(ip)) { context.Response.StatusCode=403; return; }
    await next(context);
});
app.MapOpenApi();
app.MapGet("/health/ready", async (CancellationToken ct) => {
    try { await using var c = new NpgsqlConnection(connection); await c.OpenAsync(ct); await using var cmd = new NpgsqlCommand("SELECT 1",c); await cmd.ExecuteScalarAsync(ct); return Results.Ok(new { status="ready" }); }
    catch (NpgsqlException) { return Results.StatusCode(503); }
}).WithDescription("Readiness requires reachable local PostgreSQL.");
app.Run();
public partial class Program;
