using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Builds the <see cref="FamilyRegistry"/> once at startup: from <c>families.json</c> when
/// <see cref="FamilyDataOptions.Registry"/> is set, else a synthesized one-family registry.</summary>
public sealed partial class FamilyRegistryLoader
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    private readonly FamilyDataOptions _options;
    private readonly IRegistryFileReader _reader;
    private readonly ILogger<FamilyRegistryLoader> _logger;

    public FamilyRegistryLoader(IOptions<FamilyDataOptions> options, IRegistryFileReader reader, ILogger<FamilyRegistryLoader> logger)
    {
        _options = options.Value;
        _reader = reader;
        _logger = logger;
    }

    public FamilyRegistry Load()
    {
        if (string.IsNullOrWhiteSpace(_options.Registry))
        {
            _logger.LogInformation("No family registry configured; serving one family from the seed source.");
            return FamilyRegistry.Single(_options.Source);
        }

        try
        {
            var registry = Parse(_reader.Read(_options.Registry), _options.Registry);
            _logger.LogInformation("Family registry loaded ({FamilyCount} families, default {DefaultFamily}).",
                registry.Families.Count, registry.DefaultFamilyId);
            return registry;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Family registry at {Registry} could not be loaded.", _options.Registry);
            throw;
        }
    }

    /// <summary>Parses and validates registry JSON, resolving each relative <c>source</c> against
    /// <paramref name="registryLocation"/>. Throws <see cref="InvalidOperationException"/> on any
    /// malformed entry so a bad registry fails startup instead of serving half a site.</summary>
    public static FamilyRegistry Parse(string json, string registryLocation)
    {
        var file = JsonSerializer.Deserialize<FamilyRegistryFile>(json, SerializerOptions)
            ?? throw new InvalidOperationException("Family registry deserialized to null.");
        if (file.Families.Count == 0)
        {
            throw new InvalidOperationException("Family registry lists no families.");
        }

        var entries = new List<FamilyRegistryEntry>(file.Families.Count);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entry in file.Families)
        {
            var id = entry.Id ?? "";
            if (!IdPattern().IsMatch(id))
            {
                throw new InvalidOperationException($"Family id '{id}' must match ^[a-z0-9-]+$.");
            }
            if (string.IsNullOrWhiteSpace(entry.Source))
            {
                throw new InvalidOperationException($"Family '{id}' has no source.");
            }
            if (!seen.Add(id))
            {
                throw new InvalidOperationException($"Family registry has a duplicate id '{id}'.");
            }

            entries.Add(new FamilyRegistryEntry(
                id, ResolveSource(registryLocation, entry.Source), entry.Name ?? new LocalizedText(), entry.MediaPrefix));
        }

        var defaultId = file.DefaultFamily ?? "";
        if (!seen.Contains(defaultId))
        {
            throw new InvalidOperationException($"Default family '{defaultId}' is not listed in the registry.");
        }

        return new FamilyRegistry(entries, defaultId);
    }

    /// <summary>Resolves a family source against the registry's location: absolute paths and
    /// <c>gs://</c> URIs pass through; a relative source sits beside the registry.</summary>
    public static string ResolveSource(string registryLocation, string source)
    {
        if (source.StartsWith("gs://", StringComparison.OrdinalIgnoreCase) || Path.IsPathRooted(source))
        {
            return source;
        }

        var slash = registryLocation.LastIndexOfAny(['/', '\\']);
        return slash < 0 ? source : $"{registryLocation[..(slash + 1)]}{source}";
    }

    [GeneratedRegex("^[a-z0-9-]+$")]
    private static partial Regex IdPattern();
}
