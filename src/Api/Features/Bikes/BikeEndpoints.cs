using BikeLog.Api.Development;
using BikeLog.Api.Features.Errors;
using BikeLog.Domain.Bikes;
using BikeLog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace BikeLog.Api.Features.Bikes;

public static class BikeEndpoints
{
    public static void MapBikes(this RouteGroupBuilder api)
    {
        api.MapPost(
                "/bikes",
                async (
                    CreateBike request,
                    BikeLogDbContext db,
                    OwnerMutation mutation,
                    IDevelopmentOwner owner,
                    CancellationToken ct
                ) =>
                {
                    var bike = await mutation.ExecuteAsync(
                        owner.OwnerId,
                        _ =>
                        {
                            var b = new Bike { OwnerId = owner.OwnerId };
                            Apply(
                                b,
                                request.Name,
                                request.Make,
                                request.Model,
                                request.Kind,
                                request.Year,
                                request.Color
                            );
                            db.Bikes.Add(b);
                            return Task.FromResult(b);
                        },
                        false,
                        ct
                    );
                    return Results.Created($"/api/bikes/{bike.Id}", BikeResponse.From(bike));
                }
            )
            .Produces<BikeResponse>(201)
            .WithDescription(
                "Create a synthetic bike. Owner is supplied by the local development host."
            );
        api.MapGet(
            "/bikes/{id:guid}",
            async (Guid id, BikeLogDbContext db, IDevelopmentOwner owner, CancellationToken ct) =>
            {
                var b =
                    await db
                        .Bikes.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.OwnerId == owner.OwnerId && x.Id == id, ct)
                    ?? throw ApiInput.Missing();
                return BikeResponse.From(b);
            }
        );
        api.MapPut(
            "/bikes/{id:guid}",
            async (
                Guid id,
                EditBike request,
                BikeLogDbContext db,
                OwnerMutation mutation,
                IDevelopmentOwner owner,
                CancellationToken ct
            ) =>
            {
                var bike = await mutation.ExecuteAsync(
                    owner.OwnerId,
                    async token =>
                    {
                        var b =
                            await db.Bikes.SingleOrDefaultAsync(
                                x => x.Id == id && x.OwnerId == owner.OwnerId,
                                token
                            ) ?? throw ApiInput.Missing();
                        ApiInput.Version(request.ExpectedVersion, b.Version);
                        Apply(
                            b,
                            request.Name,
                            request.Make,
                            request.Model,
                            request.Kind,
                            request.Year,
                            request.Color
                        );
                        b.Version = checked(b.Version + 1);
                        return b;
                    },
                    false,
                    ct
                );
                return BikeResponse.From(bike);
            }
        );
    }

    private static void Apply(
        Bike b,
        string? name,
        string? make,
        string? model,
        string? kind,
        int year,
        string? color
    )
    {
        var normalizedName = ApiInput.OptionalName(name);
        var normalizedMake = ApiInput.Text(make, "make");
        var normalizedModel = ApiInput.Text(model, "model");
        ApiInput.Require(
            normalizedMake.Length <= 100 && normalizedModel.Length <= 100,
            "Make and model must be at most 100 characters."
        );
        var parsedKind = kind switch
        {
            "gravel" => BikeKind.Gravel,
            "road" => BikeKind.Road,
            "mountain" => BikeKind.Mountain,
            "hybrid" => BikeKind.Hybrid,
            "other" => BikeKind.Other,
            _ => throw new ApiException(400, "invalid_input", "Unsupported bike kind."),
        };
        ApiInput.Require(year is >= 1900 and <= 9999, "Year must be between 1900 and 9999.");
        ApiInput.Require(
            color == null
                || System.Text.RegularExpressions.Regex.IsMatch(color, "\\A#[0-9a-fA-F]{6}\\z"),
            "Color must be # followed by six hexadecimal digits."
        );
        b.Name = normalizedName;
        b.Make = normalizedMake;
        b.Model = normalizedModel;
        b.Kind = parsedKind;
        b.Year = year;
        b.Color = color;
    }
}
