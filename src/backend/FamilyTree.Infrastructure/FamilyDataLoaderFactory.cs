using Google.Cloud.Storage.V1;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Builds the right <see cref="IFamilyDataLoader"/> for one family's source URI.</summary>
public interface IFamilyDataLoaderFactory
{
    IFamilyDataLoader Create(string source);
}

public sealed class FamilyDataLoaderFactory : IFamilyDataLoaderFactory
{
    private readonly IServiceProvider _services;

    public FamilyDataLoaderFactory(IServiceProvider services)
    {
        _services = services;
    }

    public IFamilyDataLoader Create(string source)
    {
        var options = Options.Create(new FamilyDataOptions { Source = source });
        return options.Value.IsGcsSource
            ? new GcsFamilyDataLoader(_services.GetRequiredService<StorageClient>(), options)
            : new JsonFamilyDataLoader(options,
                _services.GetRequiredService<IHostEnvironment>(),
                _services.GetRequiredService<ILogger<JsonFamilyDataLoader>>());
    }
}
