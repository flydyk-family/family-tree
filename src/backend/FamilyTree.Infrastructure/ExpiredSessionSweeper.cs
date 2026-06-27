using System.Diagnostics.CodeAnalysis;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Periodically drops expired sessions from the <see cref="InMemorySessionStore"/> so
/// abandoned sessions (never read again, hence never lazily evicted on <c>GetAsync</c>)
/// cannot accumulate without bound. Registered only when the in-memory store is in use;
/// the Firestore store relies on an external TTL policy instead.
/// [ExcludeFromCodeCoverage]: a thin <see cref="PeriodicTimer"/> loop with no branching
/// worth unit-testing — the eviction logic it drives is covered on InMemorySessionStore.
/// </summary>
[ExcludeFromCodeCoverage]
public sealed class ExpiredSessionSweeper : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromMinutes(10);

    private readonly InMemorySessionStore _store;
    private readonly ILogger<ExpiredSessionSweeper> _logger;

    public ExpiredSessionSweeper(InMemorySessionStore store, ILogger<ExpiredSessionSweeper> logger)
    {
        _store = store;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(SweepInterval);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var removed = _store.EvictExpired();
                if (removed > 0)
                {
                    _logger.LogDebug("Evicted {Count} expired session(s) from the in-memory store.", removed);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown — the host is stopping. Nothing to clean up.
        }
    }
}
