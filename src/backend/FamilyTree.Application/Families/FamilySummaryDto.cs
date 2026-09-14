using FamilyTree.Application.Dtos;

namespace FamilyTree.Application.Families;

public sealed record FamilySummaryDto(string Id, LocalizedTextDto Name, bool IsDefault);
