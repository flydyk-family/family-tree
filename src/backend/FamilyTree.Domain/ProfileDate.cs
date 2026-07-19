using System.Diagnostics;

namespace FamilyTree.Domain;

/// <summary>Validates an effective (override-over-seed) partial date, returning null when
/// valid or a human-readable reason otherwise.</summary>
/// <remarks>Coherence rules: a day needs a month, and a month needs a year. Once both hold, the
/// day is validated against the effective month and year — both guaranteed known by the time the
/// day check runs (a day with an unknown month/year is rejected first), so the day check reads
/// <c>year.Value</c> under an assertion of that invariant.</remarks>
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
            // The two guards above guarantee a day implies a month implies a year, so year is set.
            Debug.Assert(year is not null, "a day-with-month reaching here implies a year was required and present");
            var daysInMonth = DateTime.DaysInMonth(year.Value, m);
            if (day < 1 || day > daysInMonth)
            {
                return $"Day {day} is not valid for month {m}.";
            }
        }
        return null;
    }
}
