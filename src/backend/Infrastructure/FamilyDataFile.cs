using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

/// <summary>The on-disk shape of the dataset. <see cref="SchemaVersion"/> guards future migrations.</summary>
internal sealed record FamilyDataFile
{
    public int SchemaVersion { get; init; }

    public IReadOnlyList<Person> People { get; init; } = [];
}
