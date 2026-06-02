using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Services;
using MediatR;

namespace FamilyTree.Application.Family.GetFamilyTree;

/// <summary>Thin handler: loads the dataset and delegates the projection to <see cref="ITreeProjectionService"/>.</summary>
public sealed class GetFamilyTreeQueryHandler : IRequestHandler<GetFamilyTreeQuery, FamilyTreeDto>
{
    private readonly IFamilyRepository _familyRepository;
    private readonly ITreeProjectionService _treeProjectionService;

    public GetFamilyTreeQueryHandler(IFamilyRepository familyRepository, ITreeProjectionService treeProjectionService)
    {
        _familyRepository = familyRepository;
        _treeProjectionService = treeProjectionService;
    }

    public async Task<FamilyTreeDto> Handle(GetFamilyTreeQuery request, CancellationToken cancellationToken)
    {
        var people = await _familyRepository.GetAllAsync(cancellationToken);
        return _treeProjectionService.BuildTree(people);
    }
}
