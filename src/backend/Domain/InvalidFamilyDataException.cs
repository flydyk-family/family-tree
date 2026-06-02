namespace FamilyTree.Domain;

/// <summary>
/// Thrown when the family data is structurally invalid and cannot be projected into a tree
/// (for example, a cycle in the parent/child ancestry).
/// </summary>
public sealed class InvalidFamilyDataException : Exception
{
    public InvalidFamilyDataException(string message)
        : base(message)
    {
    }

    public InvalidFamilyDataException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
