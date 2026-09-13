using Microsoft.Extensions.Hosting;

namespace FamilyTree.Infrastructure;

public sealed class LocalRegistryFileReader : IRegistryFileReader
{
    private readonly IHostEnvironment _environment;

    public LocalRegistryFileReader(IHostEnvironment environment)
    {
        _environment = environment;
    }

    public string Read(string location)
    {
        var path = Path.IsPathRooted(location) ? location : Path.Combine(_environment.ContentRootPath, location);
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"Family registry file not found at '{path}'.", path);
        }

        return File.ReadAllText(path);
    }
}
