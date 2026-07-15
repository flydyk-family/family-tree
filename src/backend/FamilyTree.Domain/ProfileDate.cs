namespace FamilyTree.Domain;

/// <summary>Validates an effective (post-merge) partial date. Returns null when valid,
/// otherwise a human-readable reason. Coherence: a day needs a month, a month needs a year;
/// a day must fit its month (unknown year → assume a leap year so 29 Feb is allowed).</summary>
public static class ProfileDate
{
    public static string? Validate(int? year, int? month, int? day)
    {
        if (day is not null && month is null)
        {
            return "A day requires a month.";
        }
        if (month is not null && year is null)
        {
            return "A month requires a year.";
        }
        if (day is not null && month is { } m && m >= 1 && m <= 12)
        {
            var daysInMonth = DateTime.DaysInMonth(year ?? 2000, m);
            if (day < 1 || day > daysInMonth)
            {
                return $"Day {day} is not valid for month {m}.";
            }
        }
        return null;
    }
}
