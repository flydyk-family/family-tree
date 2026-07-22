using FamilyTree.Application.Geocoding;
using FamilyTree.Domain;
using Moq;

namespace FamilyTree.UnitTests.Geocoding;

public sealed class ReverseGeocodeHandlerTests
{
    [Fact]
    public async Task Handle_WhenClientResolvesPlace_ShouldReturnPlaceId()
    {
        var client = new Mock<IGeocodingClient>();
        client.Setup(c => c.ReverseAsync(53.9, 27.5667, It.IsAny<CancellationToken>()))
            .ReturnsAsync("place-1");
        var handler = new ReverseGeocodeHandler(client.Object);

        var result = await handler.Handle(new ReverseGeocodeQuery(53.9, 27.5667), CancellationToken.None);

        result.Should().Be("place-1");
    }

    [Fact]
    public async Task Handle_WhenClientFindsNothing_ShouldReturnNull()
    {
        var client = new Mock<IGeocodingClient>();
        client.Setup(c => c.ReverseAsync(0, 0, It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);
        var handler = new ReverseGeocodeHandler(client.Object);

        var result = await handler.Handle(new ReverseGeocodeQuery(0, 0), CancellationToken.None);

        result.Should().BeNull();
    }
}
