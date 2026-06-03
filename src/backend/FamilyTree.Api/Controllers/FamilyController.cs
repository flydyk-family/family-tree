using FamilyTree.Application.Family;

namespace FamilyTree.Api.Controllers;

[ApiController]
[Route("api/family")]
public sealed class FamilyController : ControllerBase
{
    private readonly ISender _sender;

    public FamilyController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet("graph")]
    public async Task<ActionResult<FamilyGraphDto>> GetGraph(CancellationToken cancellationToken)
    {
        var graph = await _sender.Send(new GetFamilyGraphQuery(), cancellationToken);
        return Ok(graph);
    }
}
