namespace BikeLog.Domain.Bikes;

public static class BikeNaming
{
    public static string DisplayName(Bike bike) =>
        !string.IsNullOrWhiteSpace(bike.Name)
            ? bike.Name
            : string.Join(
                " ",
                new[] { bike.Make, bike.Model }.Where(x => !string.IsNullOrWhiteSpace(x))
            );
}
