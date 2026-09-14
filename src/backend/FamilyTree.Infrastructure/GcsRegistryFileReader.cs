using System.Diagnostics.CodeAnalysis;
using System.Text;
using Google.Cloud.Storage.V1;

namespace FamilyTree.Infrastructure;

/// <summary>Reads a <c>gs://bucket/object</c> registry via ADC. [ExcludeFromCodeCoverage]: a thin
/// SDK wrapper, same rationale as <see cref="GcsFamilyDataLoader"/>.</summary>
[ExcludeFromCodeCoverage]
public sealed class GcsRegistryFileReader : IRegistryFileReader
{
    // Same 30-second deadline as the seed download; this runs once at startup.
    private static readonly TimeSpan DownloadTimeout = TimeSpan.FromSeconds(30);

    private readonly StorageClient _client;

    public GcsRegistryFileReader(StorageClient client)
    {
        _client = client;
    }

    public string Read(string location)
    {
        var rest = location["gs://".Length..];
        var slash = rest.IndexOf('/');
        if (slash <= 0 || slash == rest.Length - 1)
        {
            throw new ArgumentException($"Registry '{location}' must be of the form gs://bucket/object.", nameof(location));
        }

        using var stream = new MemoryStream();
        // Startup-only, single call inside a singleton factory; ASP.NET Core has no synchronization
        // context, so blocking here is safe and gives the registry the seed download's deadline.
        OperationDeadline.RunAsync(
                DownloadTimeout, CancellationToken.None,
                ct => _client.DownloadObjectAsync(rest[..slash], rest[(slash + 1)..], stream, cancellationToken: ct),
                "Family registry download")
            .GetAwaiter().GetResult();
        return Encoding.UTF8.GetString(stream.ToArray());
    }
}
