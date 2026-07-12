using System.Security.Cryptography;
using System.Text;
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
public sealed class FamilySnapshotProvider : IFamilySnapshotProvider, IFamilyDataHealthSource
{
    private readonly IFamilyDataLoader _loader;
    private readonly IPersonOverrideStore _overrides;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<FamilySnapshotProvider> _logger;
    private readonly TimeSpan _ttl;
    private readonly SemaphoreSlim _refreshLock = new(1, 1);

    /// <summary>Consecutive failed refreshes at or above which the source is reported degraded.</summary>
    private const int DegradedThreshold = 3;

    private FamilyGraph? _snapshot;
    private DateTimeOffset _builtAt;
    // volatile: written under _refreshLock (single writer, so ++ stays correct) but read
    // lock-free by the health check, so publish each update for the reader to observe.
    private volatile int _consecutiveFailures;

    public int ConsecutiveRefreshFailures => _consecutiveFailures;
    public bool IsDataSourceDegraded => _consecutiveFailures >= DegradedThreshold;

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

            FamilyGraph seed;
            IReadOnlyDictionary<string, LocalizedText> latest;
            IReadOnlyDictionary<string, PersonMediaOverride> media;
            IReadOnlyDictionary<string, PersonProfileOverride> profiles;
            try
            {
                seed = await _loader.LoadAsync(cancellationToken);
                latest = await _overrides.GetLatestBiographiesAsync(cancellationToken);
                media = await _overrides.GetLatestMediaMapAsync(cancellationToken);
                profiles = await _overrides.GetLatestProfilesAsync(cancellationToken);
            }
            catch (Exception ex)
            {
                if (current is not null)
                {
                    // Transient source failure: keep serving the last-good snapshot and back off
                    // one TTL so we don't hit the source on every request. Escalate from Warning
                    // to Error once failures persist so a genuinely-down source (serving stale
                    // data) surfaces to monitoring instead of hiding in a stream of warnings.
                    _consecutiveFailures++;
                    _builtAt = _timeProvider.GetUtcNow();
                    if (_consecutiveFailures >= DegradedThreshold)
                    {
                        _logger.LogError(ex,
                            "Family snapshot refresh failed {FailureCount} times in a row; serving stale data (data source degraded).",
                            _consecutiveFailures);
                    }
                    else
                    {
                        _logger.LogWarning(ex,
                            "Family snapshot refresh failed; serving the last-good snapshot ({FailureCount} consecutive failure(s)).",
                            _consecutiveFailures);
                    }

                    return current;
                }

                // No snapshot yet (startup) — fail fast.
                _logger.LogError(ex, "Initial family snapshot load failed.");
                throw;
            }

            var people = (latest.Count == 0 && media.Count == 0 && profiles.Count == 0)
                ? seed.People
                : seed.People.Select(person =>
                {
                    var updated = person;
                    if (profiles.TryGetValue(person.Id, out var profile))
                    {
                        updated = ApplyProfile(updated, profile);
                    }
                    if (latest.TryGetValue(person.Id, out var biography))
                    {
                        updated = updated with { Biography = biography };
                    }
                    if (media.TryGetValue(person.Id, out var m))
                    {
                        var seedPortraitHidden = person.Portrait is not null && m.HiddenSeeds.Contains(person.Portrait);
                        var seedVideoHidden = person.PortraitVideo is not null && m.HiddenSeeds.Contains(person.PortraitVideo);

                        var gallery = m.Gallery;
                        // Surface a displaced, non-hidden seed portrait as a re-selectable virtual gallery
                        // tile. Computed each merge, so clearing the override portrait reverts the seed with
                        // no duplicate; a hidden seed is never surfaced.
                        if (m.Portrait is not null && person.Portrait is not null && !seedPortraitHidden)
                        {
                            gallery = [.. m.Gallery, SeedTile(person.Portrait, person.PortraitThumb)];
                        }
                        updated = updated with
                        {
                            Portrait = m.Portrait?.Full ?? (seedPortraitHidden ? null : updated.Portrait),
                            PortraitThumb = m.Portrait?.Thumb,
                            Gallery = gallery,
                            PortraitVideo = seedVideoHidden ? null : updated.PortraitVideo
                        };
                    }
                    return updated;
                }).ToList();

            var merged = new FamilyGraph(people, seed.Unions);
            _snapshot = merged;
            _builtAt = _timeProvider.GetUtcNow();
            _consecutiveFailures = 0;
            _logger.LogDebug("Family snapshot rebuilt ({PeopleCount} people, {OverrideCount} bio, {MediaCount} media, {ProfileCount} profile overrides).",
                people.Count, latest.Count, media.Count, profiles.Count);
            return merged;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    /// <summary>Builds the virtual gallery tile for a displaced seed portrait. Its key is a bare
    /// filename (no '/'), which the editor UI and the promote/delete handlers use to recognize a
    /// seed (never deletable, re-selectable). The id is deterministic so the front end can promote it.</summary>
    private static Photo SeedTile(string seedFull, string? seedThumb)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(seedFull));
        var id = "seed-" + Convert.ToHexStringLower(hash)[..16];
        return new Photo(id, seedFull, seedThumb ?? seedFull);
    }

    /// <summary>Applies a profile override to a seed person. Every override field is coalesced
    /// with the seed: a null field (or null locale) inherits the seed value, so a partial edit
    /// never drops data. Names merge per locale.</summary>
    private static Person ApplyProfile(Person seed, PersonProfileOverride profile) => seed with
    {
        GivenName = MergeText(profile.GivenName, seed.GivenName),
        Surname = MergeText(profile.Surname, seed.Surname),
        MaidenName = profile.MaidenName is null ? seed.MaidenName : MergeText(profile.MaidenName, seed.MaidenName ?? new LocalizedText()),
        Sex = profile.Sex ?? seed.Sex,
        Vocation = profile.Vocation ?? seed.Vocation,
        Birth = profile.BirthYear is null ? seed.Birth : seed.Birth with { Year = profile.BirthYear },
        Death = profile.DeathYear is null
            ? seed.Death
            : (seed.Death is null ? new LifeEvent { Year = profile.DeathYear } : seed.Death with { Year = profile.DeathYear })
    };

    private static LocalizedText MergeText(LocalizedText? over, LocalizedText seed)
    {
        if (over is null)
        {
            return seed;
        }

        return new LocalizedText
        {
            Ru = over.Ru ?? seed.Ru,
            Be = over.Be ?? seed.Be,
            En = over.En ?? seed.En
        };
    }
}
