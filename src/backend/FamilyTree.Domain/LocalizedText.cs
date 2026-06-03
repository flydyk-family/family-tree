namespace FamilyTree.Domain;

public sealed record LocalizedText
{
    public string? Ru { get; init; }
    public string? Be { get; init; }
    public string? En { get; init; }

    public string? Resolve(string locale)
    {
        var requested = locale switch
        {
            "ru" => Ru,
            "be" => Be,
            "en" => En,
            _ => null
        };

        return FirstNonEmpty(requested, Ru, En, Be);
    }

    private static string? FirstNonEmpty(params string?[] values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }
}
