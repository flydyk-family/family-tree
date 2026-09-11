using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Thrown when a request names a family that is not in the registry.</summary>
public sealed class UnknownFamilyException : Exception
{
    public UnknownFamilyException(string familyId)
        : base($"Family '{familyId}' is not registered.")
    {
        FamilyId = familyId;
    }

    public string FamilyId { get; }
}

/// <summary>One <see cref="FamilySnapshotProvider"/> per registered family, created on first use.
/// Each keeps its own TTL, lock and last-good fallback, so a broken seed degrades only its tree.</summary>
public sealed class FamilySnapshotRegistry
{
    /// <summary>DI key of the raw, unscoped override store singleton.</summary>
    public const string RawOverrideStoreKey = "raw";

    private readonly FamilyRegistry _registry;
    private readonly IFamilyDataLoaderFactory _loaders;
    private readonly IPersonOverrideStore _rawOverrides;
    private readonly IOptions<FamilyDataOptions> _options;
    private readonly TimeProvider _timeProvider;
    private readonly ILoggerFactory _loggerFactory;
    private readonly ConcurrentDictionary<string, FamilySnapshotProvider> _providers = new(StringComparer.Ordinal);

    public FamilySnapshotRegistry(
        FamilyRegistry registry,
        IFamilyDataLoaderFactory loaders,
        [FromKeyedServices(RawOverrideStoreKey)] IPersonOverrideStore rawOverrides,
        IOptions<FamilyDataOptions> options,
        TimeProvider timeProvider,
        ILoggerFactory loggerFactory)
    {
        _registry = registry;
        _loaders = loaders;
        _rawOverrides = rawOverrides;
        _options = options;
        _timeProvider = timeProvider;
        _loggerFactory = loggerFactory;
    }

    /// <summary>The provider for a family, created on first use.</summary>
    /// <exception cref="UnknownFamilyException">The family is not registered.</exception>
    public IFamilySnapshotProvider For(string familyId) => ProviderFor(familyId);

    /// <summary>The health source of a family's provider (creating the provider if needed).</summary>
    public IFamilyDataHealthSource HealthFor(string familyId) => ProviderFor(familyId);

    /// <summary>Ids of every created provider currently reporting a degraded source.</summary>
    public IReadOnlyList<string> DegradedFamilies =>
        [.. _providers.Where(pair => pair.Value.IsDataSourceDegraded).Select(pair => pair.Key).Order(StringComparer.Ordinal)];

    private FamilySnapshotProvider ProviderFor(string familyId)
    {
        var entry = _registry.Find(familyId) ?? throw new UnknownFamilyException(familyId);
        return _providers.GetOrAdd(familyId, id => new FamilySnapshotProvider(
            _loaders.Create(entry.Source),
            new FamilyScopedOverrideStore(_rawOverrides, _registry, id),
            _options,
            _timeProvider,
            _loggerFactory.CreateLogger<FamilySnapshotProvider>(),
            _registry,
            id));
    }
}
