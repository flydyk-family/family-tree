namespace FamilyTree.Application.Dtos;

public sealed record LifeEventDto(int? Year, int? Month, int? Day, bool Approx, string? Place);
