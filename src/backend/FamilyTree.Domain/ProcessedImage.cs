namespace FamilyTree.Domain;

/// <summary>A processed upload: the dimension-capped WebP and its WebP thumbnail.</summary>
public sealed record ProcessedImage(byte[] Full, byte[] Thumb, int Width, int Height);
