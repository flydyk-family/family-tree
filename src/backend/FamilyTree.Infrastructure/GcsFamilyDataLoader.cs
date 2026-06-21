using System.Diagnostics.CodeAnalysis;
using System.Text;
using Google.Cloud.Storage.V1;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Reads the seed graph from a "gs://bucket/object" URI in deployment, via the Cloud
/// Storage client (Application Default Credentials — no key). Parsing is delegated to
/// <see cref="JsonFamilyDataLoader.Deserialize"/> so both loaders share one parse path.
/// [ExcludeFromCodeCoverage]: a thin SDK wrapper with no testable branching, verified
/// against a real bucket — same rationale as GoogleIdTokenValidator / the Firestore stores.
/// </summary>
[ExcludeFromCodeCoverage]
public sealed class GcsFamilyDataLoader : IFamilyDataLoader
{
    private readonly StorageClient _client;
    private readonly string _bucket;
    private readonly string _object;

    public GcsFamilyDataLoader(StorageClient client, IOptions<FamilyDataOptions> options)
    {
        _client = client;
        (_bucket, _object) = ParseGsUri(options.Value.Source);
    }

    public async Task<FamilyGraph> LoadAsync(CancellationToken cancellationToken)
    {
        // Exceptions propagate to FamilySnapshotProvider, which logs them at the right
        // level — Warning when it serves the last-good snapshot, Error on the initial
        // (startup) load. Catching/logging here too would double-log a recovered blip
        // at Error level, which reads as alarming in monitoring.
        using var stream = new MemoryStream();
        await _client.DownloadObjectAsync(_bucket, _object, stream, cancellationToken: cancellationToken);
        var json = Encoding.UTF8.GetString(stream.ToArray());
        return JsonFamilyDataLoader.Deserialize(json);
    }

    private static (string Bucket, string Object) ParseGsUri(string uri)
    {
        const string scheme = "gs://";
        if (!uri.StartsWith(scheme, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException($"Seed source '{uri}' is not a gs:// URI.", nameof(uri));
        }

        var rest = uri[scheme.Length..];
        var slash = rest.IndexOf('/');
        if (slash <= 0 || slash == rest.Length - 1)
        {
            throw new ArgumentException($"Seed source '{uri}' must be of the form gs://bucket/object.", nameof(uri));
        }

        return (rest[..slash], rest[(slash + 1)..]);
    }
}
