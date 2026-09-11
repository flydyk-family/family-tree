namespace FamilyTree.Infrastructure;

/// <summary>An <see cref="IPersonOverrideStore"/> view of one family over the shared store. Callers
/// use bare person ids; this translates them with <see cref="StorageKeys.OverrideKey"/> and filters
/// the map getters to the family, re-keyed by bare person id.</summary>
public sealed class FamilyScopedOverrideStore : IPersonOverrideStore
{
    private readonly IPersonOverrideStore _inner;
    private readonly FamilyRegistry _registry;
    private readonly string _familyId;

    public FamilyScopedOverrideStore(IPersonOverrideStore inner, FamilyRegistry registry, string familyId)
    {
        _inner = inner;
        _registry = registry;
        _familyId = familyId;
    }

    public Task AppendBiographyAsync(string personId, LocalizedText biography, string editorEmail, CancellationToken cancellationToken) =>
        _inner.AppendBiographyAsync(Key(personId), biography, editorEmail, cancellationToken);

    public Task<LocalizedText?> GetLatestBiographyAsync(string personId, CancellationToken cancellationToken) =>
        _inner.GetLatestBiographyAsync(Key(personId), cancellationToken);

    public async Task<IReadOnlyDictionary<string, LocalizedText>> GetLatestBiographiesAsync(CancellationToken cancellationToken) =>
        Scope(await _inner.GetLatestBiographiesAsync(cancellationToken));

    public Task AppendMediaAsync(string personId, PersonMediaOverride media, string editorEmail, CancellationToken cancellationToken) =>
        _inner.AppendMediaAsync(Key(personId), media, editorEmail, cancellationToken);

    public Task<PersonMediaOverride?> GetLatestMediaAsync(string personId, CancellationToken cancellationToken) =>
        _inner.GetLatestMediaAsync(Key(personId), cancellationToken);

    public async Task<IReadOnlyDictionary<string, PersonMediaOverride>> GetLatestMediaMapAsync(CancellationToken cancellationToken) =>
        Scope(await _inner.GetLatestMediaMapAsync(cancellationToken));

    public Task AppendProfileAsync(string personId, PersonProfileOverride profile, string editorEmail, CancellationToken cancellationToken) =>
        _inner.AppendProfileAsync(Key(personId), profile, editorEmail, cancellationToken);

    public Task<PersonProfileOverride?> GetLatestProfileAsync(string personId, CancellationToken cancellationToken) =>
        _inner.GetLatestProfileAsync(Key(personId), cancellationToken);

    public async Task<IReadOnlyDictionary<string, PersonProfileOverride>> GetLatestProfilesAsync(CancellationToken cancellationToken) =>
        Scope(await _inner.GetLatestProfilesAsync(cancellationToken));

    private string Key(string personId) => StorageKeys.OverrideKey(_registry, _familyId, personId);

    // The default family owns every key without the separator; another family owns the keys under
    // its own prefix, returned with the prefix stripped.
    private Dictionary<string, T> Scope<T>(IReadOnlyDictionary<string, T> all)
    {
        if (_registry.IsDefault(_familyId))
        {
            return all.Where(pair => !pair.Key.Contains(StorageKeys.OverrideSeparator, StringComparison.Ordinal))
                      .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
        }

        var prefix = $"{_familyId}{StorageKeys.OverrideSeparator}";
        return all.Where(pair => pair.Key.StartsWith(prefix, StringComparison.Ordinal))
                  .ToDictionary(pair => pair.Key[prefix.Length..], pair => pair.Value, StringComparer.Ordinal);
    }
}
