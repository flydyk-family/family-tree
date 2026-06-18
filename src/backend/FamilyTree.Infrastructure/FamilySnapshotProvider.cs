using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Holds one merged <see cref="FamilyGraph"/> (JSON seed + latest biography overrides)
/// and serves every read from it. Rebuilds when the TTL elapses or on an explicit
/// refresh (an editor's save). A rebuild re-reads family.json via <see cref="IFamilyDataLoader"/>
/// and re-pulls overrides, so a manually replaced seed file is also picked up within the TTL.
/// Registered as a singleton; refresh is serialized by a semaphore to avoid a rebuild stampede.
/// </summary>
public sealed class FamilySnapshotProvider : IFamilySnapshotProvider
{
    private readonly IFamilyDataLoader _loader;
    private readonly IPersonOverrideStore _overrides;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<FamilySnapshotProvider> _logger;
    private readonly TimeSpan _ttl;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    private FamilyGraph? _snapshot;
    private DateTimeOffset _builtAt;

    public FamilySnapshotProvider(
        IFamilyDataLoader loader,
        IPersonOverrideStore overrides,
        IOptions<FamilyDataOptions> options,
        TimeProvider timeProvider,
        ILogger<FamilySnapshotProvider> logger)
    {
        _loader = loader;
        _overrides = overrides;
        _timeProvider = timeProvider;
        _logger = logger;
        _ttl = TimeSpan.FromMinutes(Math.Max(1, options.Value.SnapshotTtlMinutes));
    }

    public async ValueTask<FamilyGraph> GetAsync(CancellationToken cancellationToken)
    {
        var current = _snapshot;
        if (current is not null && _timeProvider.GetUtcNow() - _builtAt < _ttl)
        {
            return current;
        }

        return await RebuildAsync(force: false, cancellationToken);
    }

    public async Task RefreshAsync(CancellationToken cancellationToken)
    {
        await RebuildAsync(force: true, cancellationToken);
    }

    private async Task<FamilyGraph> RebuildAsync(bool force, CancellationToken cancellationToken)
    {
        await _refreshLock.WaitAsync(cancellationToken);
        try
        {
            // Another caller may have rebuilt while we waited — re-check the TTL (unless forced).
            var current = _snapshot;
            if (!force && current is not null && _timeProvider.GetUtcNow() - _builtAt < _ttl)
            {
                return current;
            }

            var seed = _loader.Load();
            var latest = await _overrides.GetLatestBiographiesAsync(cancellationToken);

            var people = latest.Count == 0
                ? seed.People
                : seed.People
                    .Select(person => latest.TryGetValue(person.Id, out var biography)
                        ? person with { Biography = biography }
                        : person)
                    .ToList();

            var merged = new FamilyGraph(people, seed.Unions);
            _snapshot = merged;
            _builtAt = _timeProvider.GetUtcNow();
            _logger.LogDebug("Family snapshot rebuilt ({PeopleCount} people, {OverrideCount} overrides).",
                people.Count, latest.Count);
            return merged;
        }
        finally
        {
            _refreshLock.Release();
        }
    }
}
