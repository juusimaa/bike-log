using BikeLog.Api.Features.Installations;
namespace BikeLog.Api.Features.Components;
public sealed record CreateComponent(string? Type,string? Model);
public sealed record ComponentResponse(Guid Id,string Type,string Model,long Version,IReadOnlyList<InstallationResponse> Installations);
