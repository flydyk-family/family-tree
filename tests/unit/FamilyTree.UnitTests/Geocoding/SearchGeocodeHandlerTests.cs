using FamilyTree.Application.Geocoding;
using FamilyTree.Domain;
using Moq;

namespace FamilyTree.UnitTests.Geocoding;

public sealed class SearchGeocodeHandlerTests
{
    [Fact]
    public async Task Handle_WhenClientReturnsResults_ShouldMapEachToDto()
    {
        var client = new Mock<IGeocodingClient>();
        client.Setup(c => c.SearchAsync("Minsk", It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<GeocodePlace>)
            [
                new GeocodePlace(53.9, 27.5667, "Minsk, Belarus", "place-1"),
                new GeocodePlace(53.0, 27.0, "Somewhere else", "place-2")
            ]);
        var handler = new SearchGeocodeHandler(client.Object);

        var result = await handler.Handle(new SearchGeocodeQuery("Minsk"), CancellationToken.None);

        result.Should().BeEquivalentTo(
        [
            new GeocodePlaceDto(53.9, 27.5667, "Minsk, Belarus", "place-1", null),
            new GeocodePlaceDto(53.0, 27.0, "Somewhere else", "place-2", null)
        ]);
    }

    /// <summary>The picker frames the map from this viewport, so it has to survive the
    /// domain→DTO hop rather than being dropped on the way out.</summary>
    [Fact]
    public async Task Handle_WhenPlaceHasViewport_ShouldCarryItsBoundsOntoTheDto()
    {
        var client = new Mock<IGeocodingClient>();
        client.Setup(c => c.SearchAsync("Minsk", It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<GeocodePlace>)
            [
                new GeocodePlace(53.9, 27.5667, "Minsk, Belarus", "place-1",
                    new GeocodeViewport(53.82, 27.38, 54.02, 27.76))
            ]);
        var handler = new SearchGeocodeHandler(client.Object);

        var result = await handler.Handle(new SearchGeocodeQuery("Minsk"), CancellationToken.None);

        result.Should().ContainSingle().Which.Viewport.Should()
            .Be(new GeocodeViewportDto(53.82, 27.38, 54.02, 27.76));
    }

    [Fact]
    public async Task Handle_WhenClientReturnsEmpty_ShouldReturnEmptyList()
    {
        var client = new Mock<IGeocodingClient>();
        client.Setup(c => c.SearchAsync("nowhere", It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<GeocodePlace>)[]);
        var handler = new SearchGeocodeHandler(client.Object);

        var result = await handler.Handle(new SearchGeocodeQuery("nowhere"), CancellationToken.None);

        result.Should().BeEmpty();
    }
}
