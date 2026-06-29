namespace FamilyTree.Domain;

/// <summary>Validates an uploaded image and produces a clean WebP plus a thumbnail.</summary>
public interface IImageProcessor
{
    /// <exception cref="InvalidImageException">Input is not a supported, decodable image.</exception>
    ProcessedImage Process(ReadOnlyMemory<byte> input);
}

/// <summary>Thrown when an upload is not a decodable image in a supported format.</summary>
public sealed class InvalidImageException(string message) : Exception(message);
