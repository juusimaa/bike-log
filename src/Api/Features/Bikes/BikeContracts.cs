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
    IReadOnlyList<string> MissingPositions
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
            missing
        );
}
