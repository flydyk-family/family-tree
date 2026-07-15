namespace FamilyTree.Domain;

/// <summary>Validates an effective (override-over-seed) partial date, returning null when
/// valid or a human-readable reason otherwise.</summary>
/// <remarks>Coherence rules: a day needs a month, and a month needs a year. Once both hold, the
/// day is validated against the effective month and year — both guaranteed known by then. The
/// <c>?? 2000</c> in the day check only satisfies the compiler and is never actually reached: a
/// day with an unknown year is rejected upstream ("a day requires a month", then "a month
/// requires a year"), so <see cref="DateTime.DaysInMonth"/> always runs with a real year.</remarks>
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
