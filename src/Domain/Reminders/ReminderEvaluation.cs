namespace BikeLog.Domain.Reminders;

public sealed record ReminderEvaluation(
    long RuleVersion,
    string State,
    bool Enabled,
    string? Method,
    long? OilThresholdMetres,
    long? WaxThresholdMetres,
    long? ActiveThresholdMetres,
    DateTimeOffset EvaluatedAtUtc,
    Guid? ComponentId,
    Guid? InstallationId,
    string? BaselineKind,
    DateTimeOffset? BaselineUtc,
    long? DistanceSinceBaselineMetres,
    long? RemainingMetres,
    bool? Due
);
