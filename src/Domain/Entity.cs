namespace BikeLog.Domain;

public abstract class Entity { public Guid Id { get; set; } = Guid.NewGuid(); public Guid OwnerId { get; set; } public long Version { get; set; } = 1; }
