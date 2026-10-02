using System.Text.RegularExpressions;
using BikeLog.Api.Features.Errors;

namespace BikeLog.Api.Features.Maintenance;

public static class MaintenanceInput
{
    public static void ValidateCost(decimal? cost, string? currency)
    {
        ApiInput.Require(
            (cost == null && currency == null)
                || (
                    cost is >= 0 and <= 9999999999999999.99m
                    && decimal.Round(cost.Value, 2) == cost
                    && currency != null
                    && Regex.IsMatch(currency, "^[A-Z]{3}$")
                ),
            "Cost must be nonnegative with up to two decimals and a three-letter uppercase currency, supplied together."
        );
    }
}
