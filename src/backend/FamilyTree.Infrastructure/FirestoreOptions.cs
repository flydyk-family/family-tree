namespace FamilyTree.Infrastructure;

public sealed class FirestoreOptions
{
    /// <summary>GCP project id. When blank, the in-memory stores are used (local dev / tests).</summary>
    public string ProjectId { get; set; } = "";

    public string SessionsCollection { get; set; } = "sessions";

    public string OverridesCollection { get; set; } = "personOverrides";
}
