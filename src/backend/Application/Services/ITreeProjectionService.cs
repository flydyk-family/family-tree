using FamilyTree.Application.Dtos;
using FamilyTree.Domain;

namespace FamilyTree.Application.Services;

/// <summary>Projects the raw member list into the renderable <see cref="FamilyTreeDto"/> (nodes + edges).</summary>
public interface ITreeProjectionService
{
    FamilyTreeDto BuildTree(IReadOnlyCollection<Person> people);
}
