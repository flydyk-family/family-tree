using FamilyTree.Application.Dtos;
using MediatR;

namespace FamilyTree.Application.Family.GetFamilyTree;

/// <summary>Requests the whole family tree projected for rendering.</summary>
public sealed record GetFamilyTreeQuery : IRequest<FamilyTreeDto>;
