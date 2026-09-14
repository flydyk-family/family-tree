using System.Net.Http.Headers;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;

namespace FamilyTree.IntegrationTests;

/// <summary>Multipart photo-upload bodies shared by the photo endpoint tests.</summary>
internal static class TestUploads
{
    /// <summary>A 64×64 blank PNG posted as <c>file</c> with the given <c>role</c> field.</summary>
    public static MultipartFormDataContent Png(string role)
    {
        using var img = new Image<Rgba32>(64, 64);
        using var ms = new MemoryStream();
        img.Save(ms, new PngEncoder());
        var file = new ByteArrayContent(ms.ToArray());
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        var content = new MultipartFormDataContent();
        content.Add(file, "file", "x.png");
        content.Add(new StringContent(role), "role");
        return content;
    }
}
