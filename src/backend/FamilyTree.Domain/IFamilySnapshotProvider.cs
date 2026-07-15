namespace FamilyTree.Domain;

/// <summary>
/// Serves all reads from a single in-memory merged snapshot (JSON seed + latest
/// biography overrides). The snapshot refreshes on a TTL and on demand (after a save),
/// so public reads never hit the override store per request and edits become visible
/// to everyone without a restart.
/// </summary>
public interface IFamilySnapshotProvider
{
    /// <summary>Returns the current snapshot, refreshing it first if the TTL has elapsed.</summary>
    ValueTask<FamilyGraph> GetAsync(CancellationToken cancellationToken);

    /// <summary>Returns the raw seed graph (before any override is merged), refreshing on the same
    /// TTL as <see cref="GetAsync"/>. Callers that must reason about what a <c>null</c> override
    /// field will inherit — e.g. validating a whole-document profile replace against the value it
    /// will actually render as — need the seed baseline, not the already-merged snapshot.</summary>
    ValueTask<FamilyGraph> GetSeedAsync(CancellationToken cancellationToken);

    /// <summary>Forces an immediate rebuild (re-reads the seed file and the overrides).</summary>
    Task RefreshAsync(CancellationToken cancellationToken);
}
