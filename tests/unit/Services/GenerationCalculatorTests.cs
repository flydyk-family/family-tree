using AwesomeAssertions;
using FamilyTree.Application.Services;
using FamilyTree.Domain;
using FamilyTree.UnitTests.TestData;

namespace FamilyTree.UnitTests.Services;

public sealed class GenerationCalculatorTests
{
    private static readonly Guid GrandParent = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Parent = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Child = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private readonly GenerationCalculator _calculator = new();

    [Fact]
    public void CalculateGenerations_WhenPersonHasNoParents_ShouldReturnZero()
    {
        var people = new[] { PersonFactory.Create(GrandParent) };

        var generations = _calculator.CalculateGenerations(people);

        generations[GrandParent].Should().Be(0);
    }

    [Fact]
    public void CalculateGenerations_WhenChainOfThreeGenerations_ShouldIncrementEachLevel()
    {
        var people = new[]
        {
            PersonFactory.Create(GrandParent),
            PersonFactory.Create(Parent, fatherId: GrandParent),
            PersonFactory.Create(Child, fatherId: Parent)
        };

        var generations = _calculator.CalculateGenerations(people);

        generations[GrandParent].Should().Be(0);
        generations[Parent].Should().Be(1);
        generations[Child].Should().Be(2);
    }

    [Fact]
    public void CalculateGenerations_WhenParentsAtDifferentLevels_ShouldReturnMaxParentLevelPlusOne()
    {
        var deepGrandParent = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var people = new[]
        {
            PersonFactory.Create(deepGrandParent),
            PersonFactory.Create(GrandParent),
            PersonFactory.Create(Parent, fatherId: deepGrandParent),
            // Child's father is one level deep, mother is at the root => max(1, 0) + 1 = 2.
            PersonFactory.Create(Child, fatherId: Parent, motherId: GrandParent)
        };

        var generations = _calculator.CalculateGenerations(people);

        generations[Child].Should().Be(2);
    }

    [Fact]
    public void CalculateGenerations_WhenParentReferenceMissingFromDataset_ShouldTreatMemberAsRoot()
    {
        var unknownParent = Guid.Parse("99999999-9999-9999-9999-999999999999");
        var people = new[] { PersonFactory.Create(Child, fatherId: unknownParent) };

        var generations = _calculator.CalculateGenerations(people);

        generations[Child].Should().Be(0);
    }

    [Fact]
    public void CalculateGenerations_WhenAncestryContainsCycle_ShouldThrowInvalidFamilyData()
    {
        var people = new[]
        {
            PersonFactory.Create(Parent, fatherId: Child),
            PersonFactory.Create(Child, fatherId: Parent)
        };

        var act = () => _calculator.CalculateGenerations(people);

        act.Should().Throw<InvalidFamilyDataException>();
    }
}
