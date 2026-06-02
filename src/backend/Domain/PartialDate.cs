namespace FamilyTree.Domain;

/// <summary>
/// An approximate historical date. Many XVIII–XIX century records only know the year,
/// so <see cref="Month"/> and <see cref="Day"/> are optional.
/// </summary>
public sealed record PartialDate(int Year, int? Month = null, int? Day = null);
