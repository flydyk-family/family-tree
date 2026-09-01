using FamilyTree.Application.Geocoding;
using FamilyTree.Domain;
using Moq;

namespace FamilyTree.UnitTests.Geocoding;

public sealed class ReverseGeocodeHandlerTests
{
    [Fact]
    public async Task Handle_WhenClientResolvesPlace_ShouldFlattenItIntoTheDto()
    {
        var client = new Mock<IGeocodingClient>();
        client.Setup(c => c.ReverseAsync(53.9, 27.5667, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new GeocodePlace(53.9, 27.5667, "Minsk, Belarus", "place-1", new GeocodeViewport(53.8, 27.4, 54.0, 27.7)));
        var handler = new ReverseGeocodeHandler(client.Object);

        var result = await handler.Handle(new ReverseGeocodeQuery(53.9, 27.5667), CancellationToken.None);

        result.PlaceId.Should().Be("place-1");
        result.Lat.Should().Be(53.9);
        result.Lng.Should().Be(27.5667);
        result.Viewport.Should().Be(new GeocodeViewportDto(53.8, 27.4, 54.0, 27.7));
    }

    [Fact]
    public async Task Handle_WhenClientFindsNothing_ShouldReturnAnAllNullDto()
    {
        var client = new Mock<IGeocodingClient>();
        client.Setup(c => c.ReverseAsync(0, 0, It.IsAny<CancellationToken>()))
            .ReturnsAsync((GeocodePlace?)null);
        var handler = new ReverseGeocodeHandler(client.Object);

        var result = await handler.Handle(new ReverseGeocodeQuery(0, 0), CancellationToken.None);

        result.Should().Be(new ReverseGeocodeResultDto(null, null, null, null));
    }
}
