using FamilyTree.Domain;

namespace FamilyTree.Application.Dtos;

/// <summary>The whole tree projected for rendering: nodes, edges, and the generation range.</summary>
public sealed record FamilyTreeDto(
    IReadOnlyList<TreeNodeDto> Nodes,
    IReadOnlyList<TreeEdgeDto> Edges,
    int MinGeneration,
    int MaxGeneration);

/// <summary>A single member as drawn on the tree. <see cref="Generation"/> drives vertical placement.</summary>
public sealed record TreeNodeDto(
    Guid Id,
    string DisplayName,
    int Generation,
    Sex Sex,
    int? BirthYear,
    int? DeathYear,
    string? PhotoUrl,
    bool IsLeaf);

public enum EdgeKind
{
    ParentChild = 0,
    Spouse = 1
}

/// <summary>
/// A connection between two members. For <see cref="EdgeKind.ParentChild"/> the edge points
/// from parent (<see cref="FromId"/>) to child (<see cref="ToId"/>); spouse edges are undirected.
/// </summary>
public sealed record TreeEdgeDto(Guid FromId, Guid ToId, EdgeKind Kind);
