using System.Collections.Concurrent;

namespace FamilyTree.Infrastructure;

/// <summary>
/// In-memory, append-only person-override store for local dev and tests. Each person
/// has a list of revisions (newest last); the latest revision wins on read. Appends
/// are thread-safe; history is retained for a future audit/undo feature.
/// </summary>
public sealed class InMemoryPersonOverrideStore : IPersonOverrideStore
{
    private sealed record Revision(LocalizedText Biography, string EditorEmail, DateTimeOffset EditedAt);

    private readonly ConcurrentDictionary<string, List<Revision>> _overrides = new(StringComparer.Ordinal);

    public Task AppendBiographyAsync(string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken)
    {
        var revision = new Revision(biography, editorEmail, DateTimeOffset.UtcNow);
        var revisions = _overrides.GetOrAdd(personId, _ => new List<Revision>());
        lock (revisions)
        {
            revisions.Add(revision);
        }

        return Task.CompletedTask;
    }

    public Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken)
    {
        if (!_overrides.TryGetValue(personId, out var revisions))
        {
            return Task.FromResult<LocalizedText?>(null);
        }

        lock (revisions)
        {
            return Task.FromResult<LocalizedText?>(revisions.Count > 0 ? revisions[^1].Biography : null);
        }
    }

    public Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken)
    {
        var latest = new Dictionary<string, LocalizedText>(StringComparer.Ordinal);
        foreach (var entry in _overrides)
        {
            lock (entry.Value)
            {
                if (entry.Value.Count > 0)
                {
                    latest[entry.Key] = entry.Value[^1].Biography;
                }
            }
        }

        return Task.FromResult<IReadOnlyDictionary<string, LocalizedText>>(latest);
    }

    private sealed record MediaRevision(PersonMediaOverride Media, string EditorEmail, DateTimeOffset EditedAt);

    private readonly ConcurrentDictionary<string, List<MediaRevision>> _media = new(StringComparer.Ordinal);

    public Task AppendMediaAsync(string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken)
    {
        var revision = new MediaRevision(media, editorEmail, DateTimeOffset.UtcNow);
        var revisions = _media.GetOrAdd(personId, _ => new List<MediaRevision>());
        lock (revisions)
        {
            revisions.Add(revision);
        }

        return Task.CompletedTask;
    }

    public Task<PersonMediaOverride?> GetLatestMediaAsync(string personId, CancellationToken cancellationToken)
    {
        if (!_media.TryGetValue(personId, out var revisions))
        {
            return Task.FromResult<PersonMediaOverride?>(null);
        }

        lock (revisions)
        {
            return Task.FromResult<PersonMediaOverride?>(revisions.Count > 0 ? revisions[^1].Media : null);
        }
    }

    public Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(CancellationToken cancellationToken)
    {
        var latest = new Dictionary<string, PersonMediaOverride>(StringComparer.Ordinal);
        foreach (var entry in _media)
        {
            lock (entry.Value)
            {
                if (entry.Value.Count > 0)
                {
                    latest[entry.Key] = entry.Value[^1].Media;
                }
            }
        }

        return Task.FromResult<IReadOnlyDictionary<string, PersonMediaOverride>>(latest);
    }
}
