using FamilyTree.Domain;

namespace FamilyTree.Infrastructure;

/// <summary>Dev/test media store: writes objects under a local folder that Vite serves at /media/*.</summary>
public sealed class LocalFileMediaStore : IMediaStore
{
    private readonly string _root;

    public LocalFileMediaStore(string rootDirectory)
    {
        _root = rootDirectory;
    }

    public async Task PutAsync(string key, ReadOnlyMemory<byte> bytes, string contentType, CancellationToken cancellationToken)
    {
        var path = ResolvePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, bytes.ToArray(), cancellationToken);
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        var path = ResolvePath(key);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    private string ResolvePath(string key) =>
        Path.Combine(_root, Path.Combine(key.Split('/')));
}
