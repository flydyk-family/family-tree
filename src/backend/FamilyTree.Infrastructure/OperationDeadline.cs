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
        catch (OperationCanceledException) when (cts.IsCancellationRequested && !cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException($"{description} timed out after {timeout.TotalSeconds:n0}s.");
        }
    }

    public static Task RunAsync(
        TimeSpan timeout,
        CancellationToken cancellationToken,
        Func<CancellationToken, Task> operation,
        string description) =>
        RunAsync(timeout, cancellationToken, async ct =>
        {
            await operation(ct);
            return true;
        }, description);
}
