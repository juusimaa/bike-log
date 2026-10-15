namespace BikeLog.Domain.Bikes;

public enum BikeKind
{
    Gravel,
    Road,
    Mountain,
    Hybrid,
    Other,
}

public sealed class Bike : Entity
{
    public string? Name { get; set; }
    public string? Make { get; set; }
    public string? Model { get; set; }
    public BikeKind? Kind { get; set; }
    public int? Year { get; set; }
    public string? Color { get; set; }
    public int? FrameWeightGrams { get; set; }
    public BikeStatus Status { get; private set; } = BikeStatus.Active;

    /// <summary>Set once when the owner deletes the bike; the row then only names its rides.</summary>
    public DateTimeOffset? DeletedUtc { get; private set; }

    public bool IsDeleted => DeletedUtc is not null;

    public void Retire()
    {
        RequireNotDeleted();
        Status = BikeStatus.Retired;
    }

    public void Reactivate()
    {
        RequireNotDeleted();
        Status = BikeStatus.Active;
    }

    /// <summary>Turns the bike into a tombstone that keeps only its display name.</summary>
    public void MarkDeleted(DateTimeOffset now)
    {
        RequireNotDeleted();
        Name = BikeNaming.DisplayName(this);
        Make = null;
        Model = null;
        Kind = null;
        Year = null;
        Color = null;
        FrameWeightGrams = null;
        DeletedUtc = now;
    }

    private void RequireNotDeleted()
    {
        if (IsDeleted)
        {
            throw new DomainValidationException("This bike has been deleted.");
        }
    }
}
