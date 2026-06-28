namespace FamilyTree.Domain;

/// <summary>Stores and removes media object bytes by key (e.g. "uploads/p-0001/h1.webp").</summary>
public interface IMediaStore
{
    Task PutAsync(string key, ReadOnlyMemory<byte> bytes, string contentType, CancellationToken cancellationToken);
    Task DeleteAsync(string key, CancellationToken cancellationToken);
}
