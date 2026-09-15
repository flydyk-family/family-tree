using FamilyTree.Api.Family;
using FamilyTree.Domain;
using Microsoft.AspNetCore.Http;

namespace FamilyTree.UnitTests.Api;

public sealed class FamilyContextMiddlewareTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("wisniewski", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "wisniewski");

    private static DefaultHttpContext Http(string? familyId)
    {
        var http = new DefaultHttpContext();
        if (familyId is not null)
        {
            http.Request.RouteValues[FamilyRouteKeys.FamilyId] = familyId;
        }
        return http;
    }

    [Fact]
    public async Task InvokeAsync_WhenRouteNamesAFamily_ShouldSetItOnTheContext()
    {
        var context = new FamilyContext(Registry);

        await new FamilyContextMiddleware(_ => Task.CompletedTask).InvokeAsync(Http("kowalski"), Registry, context);

        context.FamilyId.Should().Be("kowalski");
    }

    [Fact]
    public async Task InvokeAsync_WhenFamilyIdIsMixedCase_ShouldMatchCaseInsensitively()
    {
        var context = new FamilyContext(Registry);

        await new FamilyContextMiddleware(_ => Task.CompletedTask).InvokeAsync(Http("Kowalski"), Registry, context);

        context.FamilyId.Should().Be("kowalski");
    }

    [Fact]
    public async Task InvokeAsync_WhenRouteNamesNoFamily_ShouldKeepTheDefault()
    {
        var context = new FamilyContext(Registry);

        await new FamilyContextMiddleware(_ => Task.CompletedTask).InvokeAsync(Http(null), Registry, context);

        context.FamilyId.Should().Be("wisniewski");
    }

    [Fact]
    public async Task InvokeAsync_WhenFamilyRouteValueIsNull_ShouldKeepTheDefaultAndCallNext()
    {
        var called = false;
        var context = new FamilyContext(Registry);
        var http = new DefaultHttpContext();
        http.Request.RouteValues[FamilyRouteKeys.FamilyId] = null;

        await new FamilyContextMiddleware(_ => { called = true; return Task.CompletedTask; })
            .InvokeAsync(http, Registry, context);

        called.Should().BeTrue();
        context.FamilyId.Should().Be("wisniewski");
    }

    [Fact]
    public async Task InvokeAsync_WhenFamilyIsNotRegistered_ShouldReturn404WithoutCallingNext()
    {
        var called = false;
        var http = Http("nowak");
        http.Response.Body = new MemoryStream();

        await new FamilyContextMiddleware(_ => { called = true; return Task.CompletedTask; })
            .InvokeAsync(http, Registry, new FamilyContext(Registry));

        http.Response.StatusCode.Should().Be(StatusCodes.Status404NotFound);
        http.Response.ContentType.Should().StartWith("application/problem+json");
        called.Should().BeFalse();
    }
}
