using System.Text.Json;
using AwesomeAssertions;
using FamilyTree.Domain;
using FamilyTree.Infrastructure;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace FamilyTree.UnitTests.Infrastructure;

public sealed class JsonFamilyDataStoreTests : IDisposable
{
    private readonly string _tempDirectory = Directory.CreateTempSubdirectory("family-tree-tests-").FullName;

    [Fact]
    public void Load_WhenJsonValid_ShouldExposePeopleById()
    {
        var path = WriteFile("valid.json", """
        {
          "schemaVersion": 1,
          "people": [
            { "id": "11111111-1111-1111-1111-111111111111", "givenName": "Johann", "sex": "Male" }
          ]
        }
        """);

        var store = CreateStore(path);

        store.People.Should().ContainSingle();
        store.PeopleById.Should().ContainKey(Guid.Parse("11111111-1111-1111-1111-111111111111"));
    }

    [Fact]
    public void Load_WhenJsonMalformed_ShouldThrowJsonException()
    {
        var path = WriteFile("malformed.json", "{ this is not valid json ");

        var act = () => CreateStore(path);

        act.Should().Throw<JsonException>();
    }

    [Fact]
    public void Load_WhenDuplicatePersonId_ShouldThrowInvalidFamilyData()
    {
        var path = WriteFile("duplicate.json", """
        {
          "schemaVersion": 1,
          "people": [
            { "id": "11111111-1111-1111-1111-111111111111", "givenName": "Johann", "sex": "Male" },
            { "id": "11111111-1111-1111-1111-111111111111", "givenName": "Imposter", "sex": "Male" }
          ]
        }
        """);

        var act = () => CreateStore(path);

        act.Should().Throw<InvalidFamilyDataException>();
    }

    private static JsonFamilyDataStore CreateStore(string absolutePath)
    {
        var options = Options.Create(new FamilyDataOptions { FilePath = absolutePath });
        return new JsonFamilyDataStore(options, NullLogger<JsonFamilyDataStore>.Instance);
    }

    private string WriteFile(string name, string content)
    {
        var path = Path.Combine(_tempDirectory, name);
        File.WriteAllText(path, content);
        return path;
    }

    public void Dispose()
    {
        Directory.Delete(_tempDirectory, recursive: true);
    }
}
