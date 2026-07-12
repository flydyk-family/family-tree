namespace FamilyTree.Infrastructure;

public sealed class FirestoreOptions
{
    /// <summary>GCP project id. When blank, the in-memory stores are used (local dev / tests).</summary>
    public string ProjectId { get; set; } = "";

    public string SessionsCollection { get; set; } = "sessions";

    public string OverridesCollection { get; set; } = "personOverrides";

    /// <summary>Collection holding per-person media overrides (separate from biography overrides).</summary>
    public string MediaOverridesCollection { get; set; } = "mediaOverrides";

    /// <summary>Collection holding per-person profile overrides (separate from biography overrides).</summary>
    public string ProfileOverridesCollection { get; set; } = "profile-overrides";
}
