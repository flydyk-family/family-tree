using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
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
    private readonly ILogger<JsonFamilyDataLoader> _logger;

    public JsonFamilyDataLoader(IOptions<FamilyDataOptions> options, IHostEnvironment environment, ILogger<JsonFamilyDataLoader> logger)
    {
        _options = options.Value;
        _environment = environment;
        _logger = logger;
    }

    public FamilyGraph Load()
    {
        var path = Path.IsPathRooted(_options.FilePath)
            ? _options.FilePath
            : Path.Combine(_environment.ContentRootPath, _options.FilePath);

        if (!File.Exists(path))
        {
            _logger.LogError("Family data file not found at '{Path}'.", path);
            throw new FileNotFoundException($"Family data file not found at '{path}'.", path);
        }

        var json = File.ReadAllText(path);
        try
        {
            return Deserialize(json);
        }
        catch (Exception ex) when (ex is System.Text.Json.JsonException or InvalidOperationException)
        {
            _logger.LogError(ex, "Failed to deserialize family data file at '{Path}'.", path);
            throw;
        }
    }

    public static FamilyGraph Deserialize(string json)
    {
        var model = JsonSerializer.Deserialize<FamilyFileModel>(json, SerializerOptions)
            ?? throw new InvalidOperationException("Family data file deserialized to null.");

        return new FamilyGraph(model.People, model.Unions);
    }
}
