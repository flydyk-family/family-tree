using FamilyTree.Application.Geocoding;
using Microsoft.AspNetCore.Authorization;

namespace FamilyTree.Api.Controllers;

/// <summary>Server-side proxy in front of the Google Geocoding web service. Every action is
/// editor-only: an unauthenticated endpoint would turn this API into a free public geocoding
/// proxy billed to the owner's Google Cloud account.</summary>
[ApiController]
[Route("api/geocode")]
public sealed class GeocodeController : ControllerBase
{
    private readonly ISender _sender;

    public GeocodeController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("search")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<IReadOnlyList<GeocodePlaceDto>>> Search(
        [FromQuery] string q, CancellationToken cancellationToken)
    {
        var results = await _sender.Send(new SearchGeocodeQuery(q), cancellationToken);
        return Ok(results);
    }

    [HttpGet("reverse")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<ReverseGeocodeResultDto>> Reverse(
        [FromQuery] double lat, [FromQuery] double lng, CancellationToken cancellationToken)
    {
        var placeId = await _sender.Send(new ReverseGeocodeQuery(lat, lng), cancellationToken);
        return Ok(new ReverseGeocodeResultDto(placeId));
    }

    [HttpGet("names")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<LocalizedNamesDto>> Names(
        [FromQuery] string placeId, CancellationToken cancellationToken)
    {
        var names = await _sender.Send(new LocalizedNamesQuery(placeId), cancellationToken);
        return names is null ? NotFound() : Ok(names);
    }
}
