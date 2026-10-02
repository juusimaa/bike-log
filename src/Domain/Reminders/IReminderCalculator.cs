using BikeLog.Domain.Installations;
using BikeLog.Domain.Maintenance;
using BikeLog.Domain.Rides;

namespace BikeLog.Domain.Reminders;

public interface IReminderCalculator
{
    ReminderEvaluation Calculate(
        ChainLubricationRule? rule,
        Installation? currentChain,
        IReadOnlyList<Ride> rides,
        IReadOnlyList<MaintenanceRecord> maintenance,
        DateTimeOffset evaluatedAtUtc
    );
}
