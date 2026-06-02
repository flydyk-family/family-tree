using AwesomeAssertions;
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Family.GetFamilyTree;
using FamilyTree.Application.Services;
using FamilyTree.Domain;
using FamilyTree.UnitTests.TestData;
using Moq;

namespace FamilyTree.UnitTests.Family;

public sealed class GetFamilyTreeQueryHandlerTests
{
    private static readonly Guid Father = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Child = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Handle_WhenTreeRequested_ShouldReturnAllNodesWithGenerationsAndEdges()
    {
        IReadOnlyList<Person> people =
        [
            PersonFactory.Create(Father),
            PersonFactory.Create(Child, fatherId: Father)
        ];
        var repository = new Mock<IFamilyRepository>();
        repository
            .Setup(repo => repo.GetAllAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(people);
        var handler = new GetFamilyTreeQueryHandler(
            repository.Object,
            new TreeProjectionService(new GenerationCalculator()));

        var result = await handler.Handle(new GetFamilyTreeQuery(), CancellationToken.None);

        result.Nodes.Should().HaveCount(2);
        result.Edges.Should().ContainSingle();
        result.MaxGeneration.Should().Be(1);
    }
}
