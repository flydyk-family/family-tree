namespace FamilyTree.Domain;

/// <summary>Thrown when adding a photo would exceed the per-person media cap.</summary>
public sealed class MediaLimitExceededException(int limit)
    : Exception($"A person can have at most {limit} photos.");
