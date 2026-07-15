namespace FamilyTree.Domain;

/// <summary>Validates an effective (post-merge) partial date. Returns null when valid,
/// otherwise a human-readable reason. Coherence: a day needs a month, a month needs a year;
/// once those hold, the day is validated against the effective month and year, both of
/// which are guaranteed known by then. The <c>?? 2000</c> below only satisfies the compiler
/// and is never actually hit: a 29 Feb with an unknown year is already rejected upstream
/// as "a month requires a year".</summary>
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
