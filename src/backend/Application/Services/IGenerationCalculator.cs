using FamilyTree.Domain;

namespace FamilyTree.Application.Services;

/// <summary>Computes the generation level of every member (0 = oldest known ancestor).</summary>
public interface IGenerationCalculator
{
    /// <summary>
    /// Returns a map of person id to generation level. A person with no known parents in the
    /// dataset is generation 0; otherwise it is one more than its deepest parent.
    /// </summary>
    /// <exception cref="InvalidFamilyDataException">A cycle exists in the ancestry.</exception>
    IReadOnlyDictionary<Guid, int> CalculateGenerations(IReadOnlyCollection<Person> people);
}
