using FamilyTree.Api.Auth;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Options;
using Moq;

namespace FamilyTree.UnitTests.Auth;

public sealed class SessionManagerTests
{
    private static SessionManager BuildManager(
        Mock<IGoogleIdTokenValidator> validator,
        Mock<ISessionStore> store,
        params string[] editors)
    {
        var google = Options.Create(new GoogleAuthOptions
        {
            ClientId = "client-xyz",
            Editors = editors
        });
        var session = Options.Create(new SessionAuthOptions
        {
            CookieName = "ft_session",
            LifetimeDays = 7,
            SlidingRenewal = true
        });
        return new SessionManager(validator.Object, store.Object, google, session);
    }

    [Fact]
    public async Task SignInAsync_WhenEditorEmail_ShouldSetCanEditTrueAndCreateSession()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        validator.Setup(v => v.ValidateAsync("good", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GoogleIdentity("editor@example.com", "Editor One"));
        var store = new Mock<ISessionStore>();
        store.Setup(s => s.CreateAsync(It.IsAny<Session>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("opaque-token");
        var manager = BuildManager(validator, store, "editor@example.com");

        var result = await manager.SignInAsync("good", CancellationToken.None);

        result.Should().NotBeNull();
        result!.Token.Should().Be("opaque-token");
        result.Identity.Email.Should().Be("editor@example.com");
        result.Identity.CanEdit.Should().BeTrue();
        store.Verify(s => s.CreateAsync(
            It.Is<Session>(session => session.CanEdit && session.Email == "editor@example.com"),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task SignInAsync_WhenNonEditorEmail_ShouldSetCanEditFalse()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        validator.Setup(v => v.ValidateAsync("good", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GoogleIdentity("guest@example.com", "Guest"));
        var store = new Mock<ISessionStore>();
        store.Setup(s => s.CreateAsync(It.IsAny<Session>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("opaque-token");
        var manager = BuildManager(validator, store, "editor@example.com");

        var result = await manager.SignInAsync("good", CancellationToken.None);

        result!.Identity.CanEdit.Should().BeFalse();
    }

    [Fact]
    public async Task SignInAsync_WhenEditorEmailDiffersInCase_ShouldStillMatch()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        validator.Setup(v => v.ValidateAsync("good", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GoogleIdentity("Editor@Example.com", "Editor One"));
        var store = new Mock<ISessionStore>();
        store.Setup(s => s.CreateAsync(It.IsAny<Session>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("opaque-token");
        var manager = BuildManager(validator, store, "editor@example.com");

        var result = await manager.SignInAsync("good", CancellationToken.None);

        result!.Identity.CanEdit.Should().BeTrue();
    }

    [Fact]
    public async Task SignInAsync_WhenTokenInvalid_ShouldReturnNullAndNotCreateSession()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        validator.Setup(v => v.ValidateAsync("bad", It.IsAny<CancellationToken>()))
            .ReturnsAsync((GoogleIdentity?)null);
        var store = new Mock<ISessionStore>();
        var manager = BuildManager(validator, store, "editor@example.com");

        var result = await manager.SignInAsync("bad", CancellationToken.None);

        result.Should().BeNull();
        store.Verify(s => s.CreateAsync(It.IsAny<Session>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SignOutAsync_WhenCalled_ShouldDeleteSession()
    {
        var validator = new Mock<IGoogleIdTokenValidator>();
        var store = new Mock<ISessionStore>();
        var manager = BuildManager(validator, store);

        await manager.SignOutAsync("opaque-token", CancellationToken.None);

        store.Verify(s => s.DeleteAsync("opaque-token", It.IsAny<CancellationToken>()), Times.Once);
    }
}
