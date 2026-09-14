using System.Text.Json;
using FamilyTree.Api.Family;
using Microsoft.AspNetCore.Http;

namespace FamilyTree.UnitTests.Api;

public sealed class FamilyNotFoundTests
{
    [Fact]
    public async Task WriteAsync_WhenCalled_ShouldWriteAProblemDetails404NamingTheFamily()
    {
        var http = new DefaultHttpContext();
        http.Response.Body = new MemoryStream();

        await FamilyNotFound.WriteAsync(http, "nowak");

        http.Response.StatusCode.Should().Be(StatusCodes.Status404NotFound);
        http.Response.ContentType.Should().StartWith("application/problem+json");
        http.Response.Body.Position = 0;
        using var body = await JsonDocument.ParseAsync(http.Response.Body);
        body.RootElement.GetProperty("title").GetString().Should().Be("Not Found");
        body.RootElement.GetProperty("status").GetInt32().Should().Be(404);
        body.RootElement.GetProperty("detail").GetString().Should().Contain("nowak");
    }
}
