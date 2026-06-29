using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class MediaStoreSelectionTests
{
    private static IServiceProvider Build(R2Options r2)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure(
            new FamilyDataOptions { Source = "", SnapshotTtlMinutes = 10 },
            new FirestoreOptions { ProjectId = "" },
            r2);
        return services.BuildServiceProvider();
    }

    [Fact]
    public void AddInfrastructure_WhenR2Unconfigured_ShouldUseLocalFileMediaStore()
    {
        var sp = Build(new R2Options { LocalMediaDirectory = Path.GetTempPath() });
        sp.GetRequiredService<IMediaStore>().Should().BeOfType<LocalFileMediaStore>();
    }

    [Fact]
    public void AddInfrastructure_ShouldRegisterImageProcessor()
    {
        var sp = Build(new R2Options { LocalMediaDirectory = Path.GetTempPath() });
        sp.GetRequiredService<IImageProcessor>().Should().BeOfType<ImageSharpImageProcessor>();
    }
}
