namespace FamilyTree.Domain;

/// <summary>
/// A link to an external profile or reference for a member (shown in the expanded popup).
/// <paramref name="Kind"/> is a lowercase discriminator such as "facebook", "instagram", "wikipedia".
/// </summary>
public sealed record SocialLink(string Kind, string Url);
