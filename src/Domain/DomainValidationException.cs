namespace BikeLog.Domain;

public sealed class DomainValidationException(string message, string code = "invalid_input")
    : Exception(message)
{
    public string Code { get; } = code;
}
