namespace FamilyTree.Application.People;

/// <summary>Identifies how an uploaded photo should be stored for a person.</summary>
public enum PhotoRole
{
    /// <summary>The primary portrait shown on the person's card and popup.</summary>
    Portrait,

    /// <summary>An additional image appended to the person's gallery.</summary>
    Gallery
}
