namespace FamilyTree.Infrastructure;

/// <summary>
/// Exposes the data-source refresh health of <see cref="FamilySnapshotProvider"/> so a
/// health check can report it without coupling to the read-path <see cref="IFamilySnapshotProvider"/>.
/// </summary>
public interface IFamilyDataHealthSource
{
    /// <summary>Consecutive snapshot-refresh failures while still serving a last-good snapshot. Resets to 0 on a successful rebuild.</summary>
    int ConsecutiveRefreshFailures { get; }

    /// <summary>True once <see cref="ConsecutiveRefreshFailures"/> reaches the degraded threshold — the source is persistently failing and served data is stale.</summary>
    bool IsDataSourceDegraded { get; }
}
