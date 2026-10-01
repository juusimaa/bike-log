using BikeLog.Domain.Maintenance;
namespace BikeLog.Api.Features.Maintenance;

public sealed record CreateMaintenance([property: System.Text.Json.Serialization.JsonRequired] Guid BikeId, Guid? ComponentId, [property: System.Text.Json.Serialization.JsonRequired] string? Task, [property: System.Text.Json.Serialization.JsonRequired] DateTimeOffset PerformedUtc, string? Notes, decimal? Cost, string? Currency);
public sealed record MaintenanceResponse(Guid Id, Guid BikeId, Guid? ComponentId, string Task, DateTimeOffset PerformedUtc, string? Notes, decimal? Cost, string? Currency, long Version)
{
    public static MaintenanceResponse From(MaintenanceRecord r) => new(r.Id, r.BikeId, r.ComponentId, r.Task, r.PerformedUtc, r.Notes, r.Cost, r.Currency, r.Version);
}
