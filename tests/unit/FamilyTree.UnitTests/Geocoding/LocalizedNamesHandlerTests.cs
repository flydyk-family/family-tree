using FamilyTree.Application.Geocoding;
using FamilyTree.Domain;
using Moq;

namespace FamilyTree.UnitTests.Geocoding;

public sealed class LocalizedNamesHandlerTests
{
    [Fact]
    public async Task Handle_WhenClientResolvesNames_ShouldMapToDto()
    {
        var client = new Mock<IGeocodingClient>();
        client.Setup(c => c.LocalizedNamesAsync("place-1", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new LocalizedNames("Минск", "Мінск", "Minsk"));
        var handler = new LocalizedNamesHandler(client.Object);

        var result = await handler.Handle(new LocalizedNamesQuery("place-1"), CancellationToken.None);

        result.Should().Be(new LocalizedNamesDto("Минск", "Мінск", "Minsk"));
    }

    [Fact]
    public async Task Handle_WhenClientCannotResolvePlace_ShouldReturnNull()
    {
        var client = new Mock<IGeocodingClient>();
        client.Setup(c => c.LocalizedNamesAsync("bogus", It.IsAny<CancellationToken>()))
            .ReturnsAsync((LocalizedNames?)null);
        var handler = new LocalizedNamesHandler(client.Object);

        var result = await handler.Handle(new LocalizedNamesQuery("bogus"), CancellationToken.None);

        result.Should().BeNull();
    }
}
