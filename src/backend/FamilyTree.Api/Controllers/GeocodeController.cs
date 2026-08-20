using FamilyTree.Application.Geocoding;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.RateLimiting;

namespace FamilyTree.Api.Controllers;

/// <summary>Server-side proxy in front of the Google Geocoding web service. Every action is
/// editor-only: an unauthenticated endpoint would turn this API into a free public geocoding
/// proxy billed to the owner's Google Cloud account.</summary>
[ApiController]
[Route("api/geocode")]
[Authorize(Policy = "CanEdit")]
// Rate limiting: these routes run on the tighter "geocode" budget instead of the general
// "api" one, because they are the only requests that cost money per call. It is wired in
// Program.cs rather than as an attribute here — the blanket RequireRateLimiting on
// MapControllers is applied after controller attributes and would silently win.
public sealed class GeocodeController : ControllerBase
{
    private readonly ISender _sender;

    public GeocodeController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("search")]
    public async Task<ActionResult<IReadOnlyList<GeocodePlaceDto>>> Search(
        [FromQuery] string q, CancellationToken cancellationToken)
    {
        var results = await _sender.Send(new SearchGeocodeQuery(q), cancellationToken);
        return Ok(results);
    }

    /// <remarks><see cref="BindRequiredAttribute"/> is load-bearing: ASP.NET Core's required-ness
    /// inference covers non-nullable *reference* types only, so a plain <c>double</c> would bind a
    /// missing parameter to <c>0</c>, sail through range validation, and spend a billed Google
    /// lookup on null island instead of returning 400.</remarks>
    [HttpGet("reverse")]
    public async Task<ActionResult<ReverseGeocodeResultDto>> Reverse(
        [FromQuery][BindRequired] double lat, [FromQuery][BindRequired] double lng, CancellationToken cancellationToken)
    {
        var placeId = await _sender.Send(new ReverseGeocodeQuery(lat, lng), cancellationToken);
        return Ok(new ReverseGeocodeResultDto(placeId));
    }

    [HttpGet("names")]
    public async Task<ActionResult<LocalizedNamesDto>> Names(
        [FromQuery] string placeId, CancellationToken cancellationToken)
    {
        var names = await _sender.Send(new LocalizedNamesQuery(placeId), cancellationToken);
        return names is null ? NotFound() : Ok(names);
    }
}
