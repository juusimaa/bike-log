using BikeLog.Domain.Rides;
using BikeLog.Domain.Installations;
namespace BikeLog.Domain.Usage;

public interface IUsageCalculator { UsageCalculation Calculate(IReadOnlyList<Ride> rides, IReadOnlyList<Installation> installations); }
