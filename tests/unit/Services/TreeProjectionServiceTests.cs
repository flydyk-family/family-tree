using AwesomeAssertions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Services;
using FamilyTree.UnitTests.TestData;

namespace FamilyTree.UnitTests.Services;

public sealed class TreeProjectionServiceTests
{
    private static readonly Guid Father = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Mother = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Child = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private readonly TreeProjectionService _service = new(new GenerationCalculator());

    [Fact]
    public void BuildTree_WhenDatasetEmpty_ShouldReturnEmptyProjection()
    {
        var tree = _service.BuildTree([]);

        tree.Nodes.Should().BeEmpty();
        tree.Edges.Should().BeEmpty();
    }

    [Fact]
    public void BuildTree_WhenNodesSpanGenerations_ShouldReportGenerationRange()
    {
        var people = new[]
        {
            PersonFactory.Create(Father),
            PersonFactory.Create(Child, fatherId: Father)
        };

        var tree = _service.BuildTree(people);

        tree.MinGeneration.Should().Be(0);
        tree.MaxGeneration.Should().Be(1);
    }

    [Fact]
    public void BuildTree_WhenNoChildrenReferencePerson_ShouldMarkPersonAsLeaf()
    {
        var people = new[]
        {
            PersonFactory.Create(Father),
            PersonFactory.Create(Child, fatherId: Father)
        };

        var tree = _service.BuildTree(people);

        tree.Nodes.Single(node => node.Id == Father).IsLeaf.Should().BeFalse();
        tree.Nodes.Single(node => node.Id == Child).IsLeaf.Should().BeTrue();
    }

    [Fact]
    public void BuildTree_WhenParentPresent_ShouldEmitParentChildEdge()
    {
        var people = new[]
        {
            PersonFactory.Create(Father),
            PersonFactory.Create(Child, fatherId: Father)
        };

        var tree = _service.BuildTree(people);

        tree.Edges.Should().ContainSingle(edge =>
            edge.Kind == EdgeKind.ParentChild && edge.FromId == Father && edge.ToId == Child);
    }

    [Fact]
    public void BuildTree_WhenSpousesReferenceEachOther_ShouldEmitSingleSpouseEdge()
    {
        var people = new[]
        {
            PersonFactory.Create(Father, spouseIds: [Mother]),
            PersonFactory.Create(Mother, spouseIds: [Father])
        };

        var tree = _service.BuildTree(people);

        tree.Edges.Count(edge => edge.Kind == EdgeKind.Spouse).Should().Be(1);
    }

    [Fact]
    public void BuildTree_WhenSpouseLinkRecordedOnOnePartnerOnly_ShouldStillEmitSingleSpouseEdge()
    {
        var people = new[]
        {
            PersonFactory.Create(Father, spouseIds: [Mother]),
            PersonFactory.Create(Mother) // does not list the spouse back
        };

        var tree = _service.BuildTree(people);

        tree.Edges.Count(edge => edge.Kind == EdgeKind.Spouse).Should().Be(1);
    }

    [Fact]
    public void BuildTree_WhenParentMissingFromDataset_ShouldNotEmitDanglingEdge()
    {
        var missingParent = Guid.Parse("99999999-9999-9999-9999-999999999999");
        var people = new[] { PersonFactory.Create(Child, fatherId: missingParent) };

        var tree = _service.BuildTree(people);

        tree.Edges.Should().BeEmpty();
    }
}
