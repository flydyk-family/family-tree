using FamilyTree.Domain;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace FamilyTree.Infrastructure;

/// <summary>ImageSharp-backed processor: decode, auto-orient, strip metadata, cap the longest
/// side, and re-encode to WebP. Produces a full image (≤2000px) and a thumbnail (≤400px).</summary>
public sealed class ImageSharpImageProcessor : IImageProcessor
{
    private const int MaxFullDimension = 2000;
    private const int MaxThumbDimension = 400;
    private static readonly WebpEncoder Encoder = new() { Quality = 82 };

    public ProcessedImage Process(ReadOnlyMemory<byte> input)
    {
        Image image;
        try
        {
            image = Image.Load(input.Span);
        }
        catch (Exception ex) when (ex is UnknownImageFormatException or InvalidImageContentException)
        {
            throw new InvalidImageException("The uploaded file is not a supported image.");
        }

        using (image)
        {
            image.Mutate(x => x.AutoOrient());
            image.Metadata.ExifProfile = null;
            image.Metadata.IptcProfile = null;
            image.Metadata.XmpProfile = null;

            var full = Encode(image, MaxFullDimension);
            var thumb = Encode(image, MaxThumbDimension);
            return new ProcessedImage(full.Bytes, thumb.Bytes, full.Width, full.Height);
        }
    }

    private static (byte[] Bytes, int Width, int Height) Encode(Image source, int maxDimension)
    {
        using var clone = source.Clone(x => x.Resize(new ResizeOptions
        {
            Mode = ResizeMode.Max,
            Size = new Size(maxDimension, maxDimension)
        }));
        using var ms = new MemoryStream();
        clone.Save(ms, Encoder);
        return (ms.ToArray(), clone.Width, clone.Height);
    }
}
