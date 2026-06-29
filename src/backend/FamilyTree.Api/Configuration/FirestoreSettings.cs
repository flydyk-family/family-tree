namespace FamilyTree.Api.Configuration;

public sealed class FirestoreSettings
{
    public string ProjectId { get; init; } = "";

    public string SessionsCollection { get; init; } = "sessions";

    public string OverridesCollection { get; init; } = "personOverrides";

    /// <summary>Collection holding per-person media overrides.</summary>
    public string MediaOverridesCollection { get; init; } = "mediaOverrides";
}
