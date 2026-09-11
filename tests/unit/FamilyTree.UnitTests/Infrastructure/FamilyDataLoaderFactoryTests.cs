using FamilyTree.Infrastructure;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Moq;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class FamilyDataLoaderFactoryTests
{
    private static FamilyDataLoaderFactory Build()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Mock.Of<IHostEnvironment>(e => e.ContentRootPath == AppContext.BaseDirectory));
        services.AddSingleton(new Mock<StorageClient>().Object);
        return new FamilyDataLoaderFactory(services.BuildServiceProvider());
    }

    [Fact]
    public void Create_WhenSourceIsALocalPath_ShouldReturnTheJsonLoader() =>
        Build().Create("Data/family.json").Should().BeOfType<JsonFamilyDataLoader>();

    [Fact]
    public void Create_WhenSourceIsAGcsUri_ShouldReturnTheGcsLoader() =>
        Build().Create("gs://bucket/family.json").Should().BeOfType<GcsFamilyDataLoader>();
}
