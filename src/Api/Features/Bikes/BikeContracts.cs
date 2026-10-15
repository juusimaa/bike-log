using System.Text.Json.Serialization;
using BikeLog.Domain.Bikes;

namespace BikeLog.Api.Features.Bikes;

public sealed record CreateBike(
    string? Name,
    [property: JsonRequired] string? Make,
    [property: JsonRequired] string? Model,
    [property: JsonRequired] string? Kind,
    [property: JsonRequired] int Year,
    string? Color,
    int? FrameWeightGrams
);

public sealed record EditBike(
    string? Name,
    [property: JsonRequired] string? Make,
    [property: JsonRequired] string? Model,
    [property: JsonRequired] string? Kind,
    [property: JsonRequired] int Year,
    string? Color,
    [property: JsonRequired] long ExpectedVersion,
    int? FrameWeightGrams
);

public sealed record BikeResponse(
    Guid Id,
    string? Name,
    long Version,
    string? Make,
    string? Model,
    string? Kind,
    int? Year,
    string? Color,
    string DisplayName,
    int? FrameWeightGrams,
    IReadOnlyList<string> MissingPositions,
    string Status
)
{
    /// <param name="missing">Positions currently missing a part; empty means the bike is complete.</param>
    public static BikeResponse From(Bike b, IReadOnlyList<string> missing) =>
        new(
            b.Id,
            b.Name,
            b.Version,
            b.Make,
            b.Model,
            b.Kind switch
            {
                BikeKind.Gravel => "gravel",
                BikeKind.Road => "road",
                BikeKind.Mountain => "mountain",
                BikeKind.Hybrid => "hybrid",
                BikeKind.Other => "other",
                _ => null,
            },
            b.Year,
            b.Color,
            BikeNaming.DisplayName(b),
            b.FrameWeightGrams,
            missing,
            BikeRef.StatusValue(b.Status)
        );
}

/// <summary>Names a bike whatever its state: active, retired or deleted.</summary>
public sealed record BikeRef(Guid Id, string DisplayName, string State)
{
    public static BikeRef From(Bike b) =>
        new(b.Id, BikeNaming.DisplayName(b), b.IsDeleted ? "deleted" : StatusValue(b.Status));

    public static string StatusValue(BikeStatus status) =>
        status == BikeStatus.Retired ? "retired" : "active";
}

public sealed record SetBikeStatus(
    [property: JsonRequired] string? Status,
    [property: JsonRequired] long ExpectedVersion
);

public sealed record FittedPartPreview(
    Guid InstallationId,
    Guid ComponentId,
    string Type,
    string Make,
    string Model,
    string Position
);

/// <summary>What deleting a bike removes and keeps; the fitted parts are the conflict check.</summary>
public sealed record BikeDeletionPreview(
    long BikeVersion,
    IReadOnlyList<FittedPartPreview> FittedParts,
    int RideCount,
    int MaintenanceCount
);

public sealed record DeleteBike(
    [property: JsonRequired] long ExpectedVersion,
    [property: JsonRequired] IReadOnlyList<Guid> FittedInstallationIds,
    [property: JsonRequired] IReadOnlyList<Guid> KeepComponentIds
);
