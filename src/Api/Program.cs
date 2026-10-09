using BikeLog.Api.Auth;
using BikeLog.Api.Development;
using BikeLog.Api.Features.Bikes;
using BikeLog.Api.Features.Collections;
using BikeLog.Api.Features.Components;
using BikeLog.Api.Features.Errors;
using BikeLog.Api.Features.Installations;
using BikeLog.Api.Features.Maintenance;
using BikeLog.Api.Features.Reminders;
using BikeLog.Api.Features.Rides;
using BikeLog.Api.Features.Usage;
using BikeLog.Domain.Reminders;
using BikeLog.Domain.Usage;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var accessMode = AuthSetup.AddBikeLogAuthentication(
    builder.Services,
    builder.Configuration,
    builder.Environment
);
if (args.Contains("--rebuild-usage"))
{
    builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning);
}
builder.Services.AddSingleton<IDevelopmentOwner, DevelopmentOwner>();
builder.Services.AddScoped<CurrentOwner>(services =>
{
    var owner = new CurrentOwner();
    if (accessMode == AccessMode.Synthetic)
    {
        owner.Set(services.GetRequiredService<IDevelopmentOwner>().OwnerId);
    }
    return owner;
});
builder.Services.AddScoped<ICurrentOwner>(services => services.GetRequiredService<CurrentOwner>());
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddOpenApi(options =>
    options
        .AddSchemaTransformer(ApiContractSchema.Describe)
        .AddOperationTransformer(CollectionEndpoints.DescribeParameters)
);
builder.Services.AddProblemDetails();
builder.Services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new UtcInstantConverter())
);
builder.Services.AddDbContext<BikeLogDbContext>(
    (services, options) =>
        options.UseNpgsql(
            services.GetRequiredService<IConfiguration>().GetConnectionString("Postgres")
        )
);
builder.Services.AddSingleton<IUsageCalculator, UsageCalculator>();
builder.Services.AddScoped<UsageRebuilder>();
builder.Services.AddScoped<OwnerMutation>();
builder.Services.AddSingleton<IReminderCalculator, ReminderCalculator>();
builder.Services.AddScoped<ReminderReader>();
builder.Services.AddScoped<BikeUsageReader>();
var app = builder.Build();
if (accessMode == AccessMode.Synthetic)
{
    DevelopmentAccess.Validate(app.Environment, app.Configuration);
}
if (args.Contains("--rebuild-usage"))
{
    await ProjectionUpgrade.RebuildAllAsync(app.Services, CancellationToken.None);
    return;
}
var connection = app.Configuration.GetConnectionString("Postgres")!;
if (accessMode == AccessMode.Synthetic)
{
    app.Use(
        async (context, next) =>
        {
            if (
                context.Connection.RemoteIpAddress is { } ip
                && !System.Net.IPAddress.IsLoopback(ip)
            )
            {
                context.Response.StatusCode = 403;
                return;
            }
            await next(context);
        }
    );
}
app.UseMiddleware<RequestErrorMiddleware>();
app.UseStatusCodePages();
if (accessMode == AccessMode.Authenticated)
{
    app.UseRouting();
    app.UseAuthentication();
    app.UseAuthorization();
}
app.MapOpenApi();
var api = app.MapGroup("/api").AddEndpointFilter<ApiProblemMapping>();
if (accessMode == AccessMode.Authenticated)
{
    api.RequireAuthorization("BikeLogAccess");
}
foreach (var status in new[] { 400, 404, 409, 500, 503 })
{
    api.WithMetadata(
        new Microsoft.AspNetCore.Http.ProducesResponseTypeMetadata(
            status,
            typeof(Microsoft.AspNetCore.Mvc.ProblemDetails),
            ["application/problem+json"]
        )
    );
}

api.MapCollections();
api.MapGet(
        "/me",
        async (BikeLogDbContext db, ICurrentOwner owner, CancellationToken ct) =>
        {
            if (accessMode == AccessMode.Synthetic)
            {
                return Results.Ok(new MeResponse(null, null));
            }
            var user = await db
                .BikeLogUsers.AsNoTracking()
                .SingleAsync(x => x.OwnerId == owner.OwnerId, ct);
            return Results.Ok(new MeResponse(user.Email, user.DisplayName));
        }
    )
    .Produces<MeResponse>(200);
api.MapBikes();
api.MapBikeOverview();
api.MapComponents();
api.MapComponentEstimates();
api.MapInstallations();
api.MapReplacementWithService();
api.MapMaintenance();
api.MapReminders();
api.MapRides();
api.MapUsage();
app.MapGet(
        "/health/ready",
        async (CancellationToken ct) =>
        {
            try
            {
                await using var c = new NpgsqlConnection(connection);
                await c.OpenAsync(ct);
                await using var cmd = new NpgsqlCommand("SELECT 1", c);
                await cmd.ExecuteScalarAsync(ct);
                return Results.Ok(new { status = "ready" });
            }
            catch (NpgsqlException)
            {
                return Results.StatusCode(503);
            }
        }
    )
    .WithDescription("Readiness requires reachable local PostgreSQL.");
app.Run();

public partial class Program;
