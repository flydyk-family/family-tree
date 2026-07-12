using FamilyTree.Domain;
using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyGraphValidatorTests
{
    [Fact]
    public void ValidateBirthYear_WhenBeforeParentBirth_ShouldFail()
    {
        var parent = TestPeople.Person("p-1", birthYear: 1900);
        var child = TestPeople.Person("p-2", birthYear: 1925, fatherId: "p-1");
        var graph = new FamilyGraph([parent, child], []);

        var result = new FamilyGraphValidator().ValidateBirthYear(graph, "p-2", 1890);

        result.IsValid.Should().BeFalse();
        result.Error.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void ValidateBirthYear_WhenAfterChildBirth_ShouldFail()
    {
        var parent = TestPeople.Person("p-1", birthYear: 1900);
        var child = TestPeople.Person("p-2", birthYear: 1925, fatherId: "p-1");
        var graph = new FamilyGraph([parent, child], []);

        new FamilyGraphValidator().ValidateBirthYear(graph, "p-1", 1930).IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateBirthYear_WhenConsistent_ShouldPass()
    {
        var parent = TestPeople.Person("p-1", birthYear: 1900);
        var child = TestPeople.Person("p-2", birthYear: 1925, fatherId: "p-1");
        var graph = new FamilyGraph([parent, child], []);

        new FamilyGraphValidator().ValidateBirthYear(graph, "p-2", 1922).IsValid.Should().BeTrue();
    }

    [Fact]
    public void ValidateBirthYear_WhenNull_ShouldPass()
    {
        var graph = new FamilyGraph([TestPeople.Person("p-1", birthYear: 1900)], []);
        new FamilyGraphValidator().ValidateBirthYear(graph, "p-1", null).IsValid.Should().BeTrue();
    }

    [Fact]
    public void ValidateBirthYear_WhenBeforeMotherBirth_ShouldFail()
    {
        var mother = TestPeople.Person("p-m", birthYear: 1900);
        var child = TestPeople.Person("p-2", birthYear: 1925, motherId: "p-m");
        var graph = new FamilyGraph([mother, child], []);

        new FamilyGraphValidator().ValidateBirthYear(graph, "p-2", 1890).IsValid.Should().BeFalse();
    }

    [Fact]
    public void ValidateBirthYear_WhenPersonMissingFromGraph_ShouldPass()
    {
        var graph = new FamilyGraph([TestPeople.Person("p-1", birthYear: 1900)], []);
        new FamilyGraphValidator().ValidateBirthYear(graph, "p-absent", 1500).IsValid.Should().BeTrue();
    }
}
