using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class ImageSharpImageProcessorTests
{
    private static byte[] Png(int w, int h)
    {
        using var image = new Image<Rgba32>(w, h);
        using var ms = new MemoryStream();
        image.SaveAsPng(ms);
        return ms.ToArray();
    }

    [Fact]
    public void Process_WhenLargePng_ShouldCapDimensionsAndEmitWebp()
    {
        var processor = new ImageSharpImageProcessor();

        var result = processor.Process(Png(3000, 1500));

        result.Width.Should().BeLessThanOrEqualTo(2000);
        result.Height.Should().BeLessThanOrEqualTo(2000);
        // WebP magic: "RIFF"...."WEBP"
        result.Full.Should().StartWith("RIFF"u8.ToArray());
        result.Thumb.Length.Should().BeLessThan(result.Full.Length);
    }

    [Fact]
    public void Process_WhenImageSmallerThanCap_ShouldNotUpscale()
    {
        var processor = new ImageSharpImageProcessor();

        // Longest side 1280 is already within the 2000px cap — dimensions must be preserved.
        var result = processor.Process(Png(720, 1280));

        result.Width.Should().Be(720);
        result.Height.Should().Be(1280);
    }

    [Fact]
    public void Process_WhenNotAnImage_ShouldThrowInvalidImageException()
    {
        var processor = new ImageSharpImageProcessor();
        var act = () => processor.Process(new byte[] { 0, 1, 2, 3, 4, 5 });
        act.Should().Throw<InvalidImageException>();
    }
}
