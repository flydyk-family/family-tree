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
            new GeocodePlaceDto(53.9, 27.5667, "Minsk, Belarus", "place-1"),
            new GeocodePlaceDto(53.0, 27.0, "Somewhere else", "place-2")
        ]);
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
