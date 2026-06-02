using System.Text.Json;
using System.Text.Json.Serialization;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>
/// Loads the JSON dataset once and serves it from immutable in-memory collections. Swapping this
/// implementation for a database-backed one requires no changes to the application layer.
/// </summary>
public sealed class JsonFamilyDataStore : IFamilyDataStore
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public IReadOnlyList<Person> People { get; }

    public IReadOnlyDictionary<Guid, Person> PeopleById { get; }

    public JsonFamilyDataStore(IOptions<FamilyDataOptions> options, ILogger<JsonFamilyDataStore> logger)
    {
        var path = ResolvePath(options.Value.FilePath);

        try
        {
            using var stream = File.OpenRead(path);
            var file = JsonSerializer.Deserialize<FamilyDataFile>(stream, SerializerOptions)
                ?? throw new InvalidFamilyDataException($"Family data file '{path}' deserialized to null.");

            People = file.People;
            PeopleById = BuildIndex(file.People);
        }
        catch (Exception ex) when (ex is IOException or JsonException or InvalidFamilyDataException)
        {
            logger.LogError(ex, "Failed to load family data from {Path}", path);
            throw;
        }
    }

    private static IReadOnlyDictionary<Guid, Person> BuildIndex(IReadOnlyList<Person> people)
    {
        var index = new Dictionary<Guid, Person>(people.Count);
        foreach (var person in people)
        {
            if (!index.TryAdd(person.Id, person))
            {
                throw new InvalidFamilyDataException($"Duplicate person id '{person.Id}' in the family data.");
            }
        }

        return index;
    }

    private static string ResolvePath(string configuredPath)
    {
        return Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.Combine(AppContext.BaseDirectory, configuredPath);
    }
}
