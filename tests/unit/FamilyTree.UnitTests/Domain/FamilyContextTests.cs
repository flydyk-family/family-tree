using FamilyTree.Domain;

namespace FamilyTree.UnitTests.Domain;

public sealed class FamilyContextTests
{
    private static readonly FamilyRegistry Registry = new(
    [
        new FamilyRegistryEntry("perovsky", "family.json", new LocalizedText(), null),
        new FamilyRegistryEntry("kowalski", "kowalski.json", new LocalizedText(), null)
    ], "perovsky");

    [Fact]
    public void FamilyId_WhenSetBeforeAnyRead_ShouldTakeTheNewValue()
    {
        var context = new FamilyContext(Registry) { FamilyId = "kowalski" };

        context.FamilyId.Should().Be("kowalski");
    }

    [Fact]
    public void FamilyId_WhenSetAfterItWasRead_ShouldThrow()
    {
        var context = new FamilyContext(Registry);
        _ = context.FamilyId;

        var act = () => context.FamilyId = "kowalski";

        act.Should().Throw<InvalidOperationException>().WithMessage("*already been read*");
    }
}
