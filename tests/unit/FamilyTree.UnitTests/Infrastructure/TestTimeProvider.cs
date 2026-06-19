namespace FamilyTree.UnitTests.Infrastructure;

/// <summary>A TimeProvider whose clock the test moves by hand — no extra package needed.</summary>
internal sealed class TestTimeProvider : TimeProvider
{
    public DateTimeOffset Now { get; set; } = DateTimeOffset.UnixEpoch;

    public override DateTimeOffset GetUtcNow() => Now;

    public void Advance(TimeSpan delta) => Now += delta;
}
