namespace FamilyTree.Domain;

/// <summary>How a person relates to another family tree.</summary>
public enum FamilyLinkRelation
{
    /// <summary>The person married into this family from the linked one.</summary>
    Origin,

    /// <summary>The person left this family for the linked one.</summary>
    Joined
}

/// <summary>An authored link from a person to another family tree, optionally naming that family's
/// record of the same person.</summary>
public sealed record FamilyLink(string Family, string? PersonId, FamilyLinkRelation Relation);
