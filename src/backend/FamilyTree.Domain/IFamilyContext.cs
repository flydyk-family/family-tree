namespace FamilyTree.Domain;

/// <summary>Which family tree the current request is about. Scoped: defaults to the registry's default
/// family and is set from the route by the family middleware.</summary>
public interface IFamilyContext
{
    string FamilyId { get; }
}

public sealed class FamilyContext : IFamilyContext
{
    private string _familyId;
    private bool _read;

    public FamilyContext(FamilyRegistry registry)
    {
        _familyId = registry.DefaultFamilyId;
    }

    /// <summary>The request's family. Setting it after it has been read throws: a service built
    /// before the family middleware ran would otherwise keep serving the default family.</summary>
    public string FamilyId
    {
        get
        {
            _read = true;
            return _familyId;
        }
        set
        {
            if (_read)
            {
                throw new InvalidOperationException(
                    "The request's family has already been read; it must be set before any family-scoped service is resolved.");
            }
            _familyId = value;
        }
    }
}
