using System.Diagnostics.CodeAnalysis;
using System.Text;
using Google.Cloud.Storage.V1;

namespace FamilyTree.Infrastructure;

/// <summary>Reads a <c>gs://bucket/object</c> registry via ADC. [ExcludeFromCodeCoverage]: a thin
/// SDK wrapper, same rationale as <see cref="GcsFamilyDataLoader"/>.</summary>
[ExcludeFromCodeCoverage]
public sealed class GcsRegistryFileReader : IRegistryFileReader
{
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
        _client.DownloadObject(rest[..slash], rest[(slash + 1)..], stream);
        return Encoding.UTF8.GetString(stream.ToArray());
    }
}
