namespace BikeLog.Domain.Installations;
public sealed class Installation : Entity { public Guid ComponentId { get; set; } public Guid BikeId { get; set; } public InstallationPosition Position { get; set; } = InstallationPosition.Chain; public DateTimeOffset StartUtc { get; set; } public DateTimeOffset? EndUtc { get; set; } }

public enum InstallationPosition { Chain }
