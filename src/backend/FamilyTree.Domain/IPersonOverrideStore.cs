namespace FamilyTree.Domain;

/// <summary>
/// Append-only store of per-person biography overrides layered over the JSON seed.
/// The interface exposes only the latest revision; revision history lives in the
/// implementation.
/// </summary>
public interface IPersonOverrideStore
{
    Task AppendBiographyAsync(string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken);
    Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken);

    Task AppendMediaAsync(string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken);
    Task<PersonMediaOverride?> GetLatestMediaAsync(string personId, CancellationToken cancellationToken);
    Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(CancellationToken cancellationToken);
}
