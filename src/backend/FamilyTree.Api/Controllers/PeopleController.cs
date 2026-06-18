using System.Security.Claims;
using FamilyTree.Application.People;
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
}
