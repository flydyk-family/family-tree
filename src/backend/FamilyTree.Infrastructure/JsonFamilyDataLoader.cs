using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

public sealed class JsonFamilyDataLoader : IFamilyDataLoader
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    private readonly FamilyDataOptions _options;
    private readonly IHostEnvironment _environment;

    public JsonFamilyDataLoader(IOptions<FamilyDataOptions> options, IHostEnvironment environment)
    {
        _options = options.Value;
        _environment = environment;
    }

    public FamilyGraph Load()
    {
        var path = Path.IsPathRooted(_options.FilePath)
            ? _options.FilePath
            : Path.Combine(_environment.ContentRootPath, _options.FilePath);

        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"Family data file not found at '{path}'.", path);
        }

        var json = File.ReadAllText(path);
        return Deserialize(json);
    }

    public static FamilyGraph Deserialize(string json)
    {
        var model = JsonSerializer.Deserialize<FamilyFileModel>(json, SerializerOptions)
            ?? throw new InvalidOperationException("Family data file deserialized to null.");

        return new FamilyGraph(model.People, model.Unions);
    }
}
