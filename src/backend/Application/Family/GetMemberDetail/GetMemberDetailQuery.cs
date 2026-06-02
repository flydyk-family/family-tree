using FamilyTree.Application.Dtos;
using MediatR;

namespace FamilyTree.Application.Family.GetMemberDetail;

/// <summary>Requests full detail for a single member; the response is null when no such member exists.</summary>
public sealed record GetMemberDetailQuery(Guid Id) : IRequest<MemberDetailDto?>;
