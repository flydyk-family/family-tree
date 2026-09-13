using FamilyTree.Api.Family;
using FamilyTree.Application.Families;
using FamilyTree.Application.Family;

namespace FamilyTree.Api.Controllers;

/// <summary>The registry of family trees and the family-scoped graph. Family-scoped person routes are
/// <see cref="PeopleController"/>'s second route template.</summary>
[ApiController]
[Route("api/families")]
public sealed class FamiliesController : ControllerBase
{
    private readonly ISender _sender;

    public FamiliesController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<FamilySummaryDto>>> GetFamilies(CancellationToken cancellationToken) =>
        Ok(await _sender.Send(new GetFamiliesQuery(), cancellationToken));

    // familyId is consumed by FamilyContextMiddleware; the graph handler reads the scoped context.
    [HttpGet("{" + FamilyRouteKeys.FamilyId + "}/graph")]
    public async Task<ActionResult<FamilyGraphDto>> GetGraph(string familyId, CancellationToken cancellationToken) =>
        Ok(await _sender.Send(new GetFamilyGraphQuery(), cancellationToken));
}
