using System.Diagnostics.CodeAnalysis;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Wraps an external (GCS / Firestore) call with an app-imposed deadline so a hung
/// connection fails fast instead of tying up the request — or, on the snapshot-refresh
/// path, holding the refresh lock and blocking every read behind it. Implemented as a
/// linked-token timeout: a genuine caller cancellation propagates unchanged, and only our
/// own timeout is surfaced as a <see cref="TimeoutException"/> (with context for the logs).
/// [ExcludeFromCodeCoverage]: timing-based glue exercised only against the real services —
/// same rationale as the SDK-wrapper stores it guards.
/// </summary>
[ExcludeFromCodeCoverage]
internal static class OperationDeadline
{
    /// <summary>Shared deadline for the latency-sensitive Firestore session/override calls.</summary>
    public static readonly TimeSpan FirestoreTimeout = TimeSpan.FromSeconds(15);

    public static async Task<T> RunAsync<T>(
        TimeSpan timeout,
        CancellationToken cancellationToken,
        Func<CancellationToken, Task<T>> operation,
        string description)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(timeout);
        try
        {
            return await operation(cts.Token);
        }
        catch (OperationCanceledException) when (cts.IsCancellationRequested)
        {
            // Decide once, inside the handler, whether this was a genuine caller cancellation
            // (re-throw unchanged) or our own deadline (surface as a TimeoutException). Doing
            // it here rather than in a two-part `when` filter avoids a caller cancellation
            // that races the deadline slipping through as an uncaught OCE.
            if (cancellationToken.IsCancellationRequested)
            {
                throw;
            }

            throw new TimeoutException($"{description} timed out after {timeout.TotalSeconds:n0}s.");
        }
    }

    public static async Task RunAsync(
        TimeSpan timeout,
        CancellationToken cancellationToken,
        Func<CancellationToken, Task> operation,
        string description)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(timeout);
        try
        {
            await operation(cts.Token);
        }
        catch (OperationCanceledException) when (cts.IsCancellationRequested)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                throw;
            }

            throw new TimeoutException($"{description} timed out after {timeout.TotalSeconds:n0}s.");
        }
    }
}
