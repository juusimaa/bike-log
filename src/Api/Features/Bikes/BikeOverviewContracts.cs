using BikeLog.Api.Features.Usage;
using BikeLog.Domain.Reminders;

namespace BikeLog.Api.Features.Bikes;

public sealed record CurrencySpend(string Currency, decimal Amount);

public sealed record RecentActivity(
    string Kind,
    Guid Id,
    string Title,
    DateTimeOffset Instant,
    Guid? ComponentId,
    long? RideDistanceMetres
);

public sealed record GroupWeightResponse(string Group, int Grams, int MissingCount);

/// <summary>Recorded weights of currently fitted parts; missingCount includes the frame.</summary>
public sealed record WeightSummaryResponse(
    IReadOnlyList<GroupWeightResponse> Groups,
    int? FrameGrams,
    int TotalGrams,
    int MissingCount
);

public sealed record BikeOverviewResponse(
    BikeResponse Bike,
    DateTimeOffset EvaluatedAtUtc,
    int RideCount,
    long RecordedDistanceMetres,
    IReadOnlyList<CurrentComponentUsage> CurrentComponents,
    IReadOnlyList<AllocationGapResponse> AllocationGaps,
    IReadOnlyList<PositionStatusResponse> PositionStatuses,
    IReadOnlyList<PositionGapResponse> PositionGaps,
    IReadOnlyList<CurrencySpend> SpendingByCurrency,
    int UnknownCostRecordCount,
    int MaintenanceRecordCount,
    IReadOnlyList<RecentActivity> RecentActivity,
    ReminderEvaluation Reminder,
    WeightSummaryResponse Weights
);
