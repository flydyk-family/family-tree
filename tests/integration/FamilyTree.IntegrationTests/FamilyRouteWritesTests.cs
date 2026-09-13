using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.Application.Dtos;
using FamilyTree.IntegrationTests.Auth;

namespace FamilyTree.IntegrationTests;

/// <summary>
/// End-to-end editor writes against a family-scoped route, proving the spec's "editing a
/// non-default family does not touch the default family" requirement.
/// </summary>
public sealed class FamilyRouteWritesTests : IDisposable
{
    // A fresh factory per test — each gets its own in-memory override store and media
    // directory, so upload/delete state never bleeds across tests (same pattern as
    // PhotoEndpointsTests).
    private readonly TwoFamilyAuthApiFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    private static LocalizedTextDto Bio(string en) => new(null, null, en);

    private static MultipartFormDataContent PngUpload(string role)
    {
        using var img = new SixLabors.ImageSharp.Image<SixLabors.ImageSharp.PixelFormats.Rgba32>(64, 64);
        using var ms = new MemoryStream();
        img.Save(ms, new SixLabors.ImageSharp.Formats.Png.PngEncoder());
        var file = new ByteArrayContent(ms.ToArray());
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        var content = new MultipartFormDataContent();
        content.Add(file, "file", "x.png");
        content.Add(new StringContent(role), "role");
        return content;
    }

    private async Task<HttpClient> SignedInEditorClientAsync()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync(
            "/api/auth/session",
            new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));
        return client;
    }

    [Fact]
    public async Task UpdateBiography_WhenEditedOnTheKowalskiFamilyRoute_ShouldNotTouchTheDefaultFamily()
    {
        var client = await SignedInEditorClientAsync();

        var put = await client.PutAsJsonAsync(
            "/api/families/kowalski/people/p-0001/biography", Bio("Maciej's story"));
        put.StatusCode.Should().Be(HttpStatusCode.OK);

        // The kowalski snapshot must reflect the edit immediately, not after the 10-minute TTL.
        var kowalski = await client.GetFromJsonAsync<PersonDto>("/api/families/kowalski/people/p-0001");
        kowalski!.Biography!.En.Should().Be("Maciej's story");

        // The default family's p-0001 (surnamed Kowalski, not Kowalczyk) is unaffected.
        var perovsky = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        perovsky!.Surname.En.Should().Be("Kowalski");
        perovsky.Biography.Should().BeNull();
    }

    [Fact]
    public async Task PostPhoto_WhenUploadedOnTheKowalskiFamilyRoute_ShouldKeyUnderThatFamilyAndNotTouchTheDefault()
    {
        var client = await SignedInEditorClientAsync();

        using var content = PngUpload("portrait");
        var response = await client.PostAsync("/api/families/kowalski/people/p-0001/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await response.Content.ReadFromJsonAsync<PersonDto>();
        dto!.Portrait.Should().StartWith("uploads/kowalski/p-0001/");

        // The default family's p-0001 still has its seed portrait, untouched by the kowalski upload.
        var perovsky = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        perovsky!.Portrait.Should().NotStartWith("uploads/");
    }
}
