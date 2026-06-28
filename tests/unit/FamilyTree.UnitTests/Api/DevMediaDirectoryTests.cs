using FamilyTree.Api.Configuration;

namespace FamilyTree.UnitTests.Api;

public sealed class DevMediaDirectoryTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "ft-devmedia-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void ResolveRepoRootMedia_WhenContentRootIsApiProjectUnderRepo_ShouldReturnRepoRootMedia()
    {
        // Mirror the real layout: <repo>/FamilyTree.slnx and the API project three levels down.
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path.Combine(_root, "FamilyTree.slnx"), "");
        var contentRoot = Path.Combine(_root, "src", "backend", "FamilyTree.Api");
        Directory.CreateDirectory(contentRoot);

        var resolved = DevMediaDirectory.ResolveRepoRootMedia(contentRoot);

        resolved.Should().Be(Path.Combine(_root, "media"));
    }

    [Fact]
    public void ResolveRepoRootMedia_WhenNoSolutionFileAtRepoRoot_ShouldReturnNull()
    {
        var contentRoot = Path.Combine(_root, "src", "backend", "FamilyTree.Api");
        Directory.CreateDirectory(contentRoot);

        DevMediaDirectory.ResolveRepoRootMedia(contentRoot).Should().BeNull();
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }
}
