using System.Security.Claims;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using Microsoft.AspNetCore.Authorization;

namespace FamilyTree.Api.Controllers;

[ApiController]
[Route("api/people")]
public sealed class PeopleController : ControllerBase
{
    private readonly ISender _sender;

    public PeopleController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PersonSummaryDto>>> GetAll(CancellationToken cancellationToken)
    {
        var people = await _sender.Send(new GetAllPeopleQuery(), cancellationToken);
        return Ok(people);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<PersonDto>> GetById(string id, CancellationToken cancellationToken)
    {
        var person = await _sender.Send(new GetPersonByIdQuery(id), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }

    [HttpPut("{id}/biography")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> UpdateBiography(
        string id,
        [FromBody] LocalizedTextDto biography,
        CancellationToken cancellationToken)
    {
        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new UpdatePersonBiographyCommand(id, biography, editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }

    [HttpPost("{id}/photos")]
    [Authorize(Policy = "CanEdit")]
    [RequestSizeLimit(15_728_640)]
    public async Task<ActionResult<PersonDto>> AddPhoto(
        string id,
        [FromForm] IFormFile file,
        [FromForm] string role,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { title = "A file is required." });
        }

        if (!Enum.TryParse<PhotoRole>(role, ignoreCase: true, out var parsedRole))
        {
            return BadRequest(new { title = "role must be 'portrait' or 'gallery'." });
        }

        await using var stream = file.OpenReadStream();
        using var buffer = new MemoryStream();
        await stream.CopyToAsync(buffer, cancellationToken);

        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        try
        {
            var person = await _sender.Send(new AddPersonPhotoCommand(id, parsedRole, buffer.ToArray(), editorEmail), cancellationToken);
            return person is null ? NotFound() : Ok(person);
        }
        catch (MediaLimitExceededException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
        catch (InvalidImageException ex)
        {
            return BadRequest(new { title = ex.Message });
        }
    }

    [HttpDelete("{id}/photos/portrait")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> DeletePortrait(string id, CancellationToken cancellationToken)
    {
        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new DeletePersonPhotoCommand(id, "portrait", editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }

    [HttpDelete("{id}/photos/gallery/{photoId}")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> DeleteGalleryPhoto(string id, string photoId, CancellationToken cancellationToken)
    {
        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new DeletePersonPhotoCommand(id, photoId, editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }

    [HttpPost("{id}/photos/gallery/{photoId}/promote")]
    [Authorize(Policy = "CanEdit")]
    public async Task<ActionResult<PersonDto>> PromoteGalleryPhoto(string id, string photoId, CancellationToken cancellationToken)
    {
        var editorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "";
        var person = await _sender.Send(new PromotePersonPhotoCommand(id, photoId, editorEmail), cancellationToken);
        return person is null ? NotFound() : Ok(person);
    }
}
