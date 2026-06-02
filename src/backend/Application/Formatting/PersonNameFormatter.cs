using FamilyTree.Domain;

namespace FamilyTree.Application.Formatting;

/// <summary>Builds the human-readable display name shown on nodes and in the popup.</summary>
public static class PersonNameFormatter
{
    public static string DisplayName(Person person)
    {
        return string.IsNullOrWhiteSpace(person.FamilyName)
            ? person.GivenName
            : $"{person.GivenName} {person.FamilyName}";
    }
}
