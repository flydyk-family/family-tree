namespace FamilyTree.Infrastructure;

/// <summary>Reads the registry document's text. Synchronous by design: it runs once, at startup,
/// inside a singleton factory.</summary>
public interface IRegistryFileReader
{
    string Read(string location);
}
