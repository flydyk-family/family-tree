using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FamilyTree.Api.Auth;
using FamilyTree.Application.Dtos;
using FamilyTree.IntegrationTests.Auth;

namespace FamilyTree.IntegrationTests;

public sealed class PhotoEndpointsTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public PhotoEndpointsTests(AuthApiFactory factory)
    {
        _factory = factory;
    }

    // --- helpers ---

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

    private static MultipartFormDataContent BytesUpload(string role, byte[] bytes)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        var content = new MultipartFormDataContent();
        content.Add(file, "file", "x.bin");
        content.Add(new StringContent(role), "role");
        return content;
    }

    // --- tests ---

    [Fact]
    public async Task PostPhoto_WhenAnonymous_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();

        using var content = PngUpload("portrait");
        var response = await client.PostAsync("/api/people/p-0001/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PostPhoto_WhenGuestNonEditor_ShouldReturn403()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.GuestIdToken));

        using var content = PngUpload("portrait");
        var response = await client.PostAsync("/api/people/p-0001/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task PostPhoto_WhenEditorUploadsPortrait_ShouldReturnPersonWithPortraitPaths()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        using var content = PngUpload("portrait");
        var response = await client.PostAsync("/api/people/p-0001/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await response.Content.ReadFromJsonAsync<PersonDto>();
        dto!.Portrait.Should().StartWith("uploads/p-0001/");
        dto.PortraitThumb.Should().EndWith(".thumb.webp");
    }

    [Fact]
    public async Task PostPhoto_WhenEditorUploadsGallery_ShouldReturnPersonWithGalleryItemAndGetConfirmsIt()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        using var content = PngUpload("gallery");
        var response = await client.PostAsync("/api/people/p-0001/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await response.Content.ReadFromJsonAsync<PersonDto>();
        dto!.Gallery.Should().HaveCountGreaterThanOrEqualTo(1);
        dto.Gallery.Last().Full.Should().StartWith("uploads/p-0001/");

        var fetched = await client.GetFromJsonAsync<PersonDto>("/api/people/p-0001");
        fetched!.Gallery.Should().HaveCountGreaterThanOrEqualTo(1);
    }

    [Fact]
    public async Task PostPhoto_WhenNonImageBytes_ShouldReturn400()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        using var content = BytesUpload("portrait", new byte[] { 0, 1, 2, 3 });
        var response = await client.PostAsync("/api/people/p-0001/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task PostPhoto_WhenRoleIsBogus_ShouldReturn400()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        using var content = PngUpload("bogus");
        var response = await client.PostAsync("/api/people/p-0001/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task DeletePortrait_WhenEditorAfterUpload_ShouldReturn200AndRevertToSeedPortrait()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        // Upload a portrait first so there's something to delete.
        using var content = PngUpload("portrait");
        await client.PostAsync("/api/people/p-0001/photos", content);

        var response = await client.DeleteAsync("/api/people/p-0001/photos/portrait");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await response.Content.ReadFromJsonAsync<PersonDto>();
        // After deleting the override, the seed portrait from family.test.json should be restored.
        dto!.Portrait.Should().Be("p-0001.jpg");
    }

    [Fact]
    public async Task PromoteGalleryPhoto_WhenEditorAfterGalleryUpload_ShouldReturn200AndSetPortrait()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        // Upload gallery photo to get its id.
        using var content = PngUpload("gallery");
        var uploadResponse = await client.PostAsync("/api/people/p-0001/photos", content);
        uploadResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var uploadDto = await uploadResponse.Content.ReadFromJsonAsync<PersonDto>();
        var photoId = uploadDto!.Gallery.Last().Id;

        var response = await client.PostAsync($"/api/people/p-0001/photos/gallery/{photoId}/promote", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await response.Content.ReadFromJsonAsync<PersonDto>();
        dto!.Portrait.Should().StartWith("uploads/p-0001/");
    }

    [Fact]
    public async Task PostPhoto_WhenPersonMissing_ShouldReturn404()
    {
        var client = _factory.CreateCookieClient();
        await client.PostAsJsonAsync("/api/auth/session", new LoginRequest(FakeGoogleIdTokenValidator.EditorIdToken));

        using var content = PngUpload("portrait");
        var response = await client.PostAsync("/api/people/p-8888/photos", content);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeleteGalleryPhoto_WhenAnonymous_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();
        var response = await client.DeleteAsync("/api/people/p-0001/photos/gallery/some-id");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PromoteGalleryPhoto_WhenAnonymous_ShouldReturn401()
    {
        var client = _factory.CreateCookieClient();
        var response = await client.PostAsync("/api/people/p-0001/photos/gallery/some-id/promote", null);
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
