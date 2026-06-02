using System.Globalization;
using FamilyTree.Domain;

namespace FamilyTree.Application.Formatting;

/// <summary>Renders an approximate <see cref="PartialDate"/> as display text (e.g. "1740", "Mar 1740", "12 Mar 1740").</summary>
public static class PartialDateFormatter
{
    public static string? ToText(PartialDate? date)
    {
        if (date is null)
        {
            return null;
        }

        var year = date.Year.ToString(CultureInfo.InvariantCulture);

        if (date.Month is not { } month || month < 1 || month > 12)
        {
            return year;
        }

        var monthName = CultureInfo.InvariantCulture.DateTimeFormat.GetAbbreviatedMonthName(month);

        if (date.Day is not { } day || date.Year < 1 || date.Year > 9999 || day < 1 ||
            day > DateTime.DaysInMonth(date.Year, month))
        {
            return $"{monthName} {year}";
        }

        return $"{day} {monthName} {year}";
    }
}
