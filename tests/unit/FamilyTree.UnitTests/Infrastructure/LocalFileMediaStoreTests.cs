using FamilyTree.Infrastructure;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class LocalFileMediaStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "media-test-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task PutAsync_ThenDeleteAsync_ShouldWriteThenRemoveFile()
    {
        var store = new LocalFileMediaStore(_root);
        await store.PutAsync("uploads/p-0001/h1.webp", new byte[] { 1, 2, 3 }, "image/webp", default);

        var path = Path.Combine(_root, "uploads", "p-0001", "h1.webp");
        File.Exists(path).Should().BeTrue();
        (await File.ReadAllBytesAsync(path)).Should().Equal(1, 2, 3);

        await store.DeleteAsync("uploads/p-0001/h1.webp", default);
        File.Exists(path).Should().BeFalse();
    }

    [Fact]
    public async Task DeleteAsync_WhenMissing_ShouldNotThrow()
    {
        var store = new LocalFileMediaStore(_root);
        var act = async () => await store.DeleteAsync("uploads/none.webp", default);
        await act.Should().NotThrowAsync();
    }

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }
}
