using System.Net;
using System.Net.Http.Json;
using FamilyTree.Application.Dtos;
using FamilyTree.Infrastructure;
using FamilyTree.IntegrationTests.Auth;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.IntegrationTests;

/// <summary>
/// The edit gate must reflect the CURRENT editor allow-list on every request, not the
/// canEdit value frozen into the session at sign-in — so removing an editor takes effect
/// immediately (even for a still-valid Firestore session that survived a redeploy), and
/// adding one is honoured without forcing a re-login.
/// </summary>
public sealed class AllowListReevaluationTests : IClassFixture<AuthApiFactory>
{
    private readonly AuthApiFactory _factory;

    public AllowListReevaluationTests(AuthApiFactory factory)
    {
        _factory = factory;
    }

    private static LocalizedTextDto Bio(string en) => new(null, null, en);

    private async Task<HttpClient> ClientWithCraftedSession(string email, bool storedCanEdit)
    {
        var store = _factory.Services.GetRequiredService<ISessionStore>();
        var now = DateTimeOffset.UtcNow;
        var token = await store.CreateAsync(new Session
        {
            Email = email,
            Name = "Crafted",
            CanEdit = storedCanEdit,
            CreatedAt = now,
            ExpiresAt = now.AddDays(7)
        }, CancellationToken.None);

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("Cookie", $"ft_session={token}");
        return client;
    }

    [Fact]
    public async Task UpdateBiography_WhenStoredCanEditButEmailNotInAllowList_ShouldReturn403()
    {
        var client = await ClientWithCraftedSession("removed@example.com", storedCanEdit: true);

        var response = await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("stale editor"));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task UpdateBiography_WhenStoredCannotEditButEmailNowInAllowList_ShouldReturn200()
    {
        var client = await ClientWithCraftedSession(FakeGoogleIdTokenValidator.EditorEmail, storedCanEdit: false);

        var response = await client.PutAsJsonAsync("/api/people/p-0001/biography", Bio("regranted editor"));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
