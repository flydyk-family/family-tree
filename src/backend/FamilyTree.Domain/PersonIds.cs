using System.Text.RegularExpressions;

namespace FamilyTree.Domain;

/// <summary>The single definition of a well-formed person id (<c>p-&lt;digits&gt;</c>), shared by the request
/// validators and seed normalisation so the two can never disagree.</summary>
public static partial class PersonIds
{
    /// <summary>The person-id pattern, as passed to FluentValidation's <c>Matches</c>.</summary>
    public const string Pattern = "^p-\\d+$";

    /// <summary>True when <paramref name="id"/> matches <see cref="Pattern"/>.</summary>
    public static bool IsValid(string? id) => id is not null && PatternRegex().IsMatch(id);

    [GeneratedRegex(Pattern)]
    private static partial Regex PatternRegex();
}
