using BikeLog.Domain.Installations;
using BikeLog.Domain.Rides;
namespace BikeLog.Domain.Usage;

public interface IUsageCalculator
{
    UsageCalculation Calculate(IReadOnlyList<Ride> rides, IReadOnlyList<Installation> installations);
}
