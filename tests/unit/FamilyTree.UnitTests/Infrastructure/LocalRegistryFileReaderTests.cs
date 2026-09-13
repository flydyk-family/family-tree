using FamilyTree.Infrastructure;
using Microsoft.Extensions.Hosting;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class LocalRegistryFileReaderTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "registry-reader-" + Guid.NewGuid().ToString("N"));

    public LocalRegistryFileReaderTests()
    {
        Directory.CreateDirectory(Path.Combine(_root, "Data"));
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private LocalRegistryFileReader Reader() =>
        new(Mock.Of<IHostEnvironment>(e => e.ContentRootPath == _root));

    [Fact]
    public void Read_WhenLocationIsRelative_ShouldResolveAgainstTheContentRoot()
    {
        File.WriteAllText(Path.Combine(_root, "Data", "families.json"), "relative");

        Reader().Read("Data/families.json").Should().Be("relative");
    }

    [Fact]
    public void Read_WhenLocationIsRooted_ShouldReadThatPathDirectly()
    {
        var path = Path.Combine(_root, "absolute.json");
        File.WriteAllText(path, "rooted");

        Reader().Read(path).Should().Be("rooted");
    }

    [Fact]
    public void Read_WhenFileIsMissing_ShouldThrowFileNotFoundWithTheResolvedPath()
    {
        var act = () => Reader().Read("Data/missing.json");

        act.Should().Throw<FileNotFoundException>()
            .Which.FileName.Should().Be(Path.Combine(_root, "Data/missing.json"));
    }
}
