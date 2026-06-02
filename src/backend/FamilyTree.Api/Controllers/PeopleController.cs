using FamilyTree.Application.People;

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
}
