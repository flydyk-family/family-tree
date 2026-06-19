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

    /// <summary>Forces an immediate rebuild (re-reads the seed file and the overrides).</summary>
    Task RefreshAsync(CancellationToken cancellationToken);
}
