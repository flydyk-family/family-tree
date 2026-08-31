using FamilyTree.Application.Dtos;
using FluentValidation;

namespace FamilyTree.Application.People;

/// <summary>Calendar-year bounds shared by every year field on a profile, so the person-level
/// and residence-level rules cannot drift apart.</summary>
internal static class ProfileYearBounds
{
    public const int Min = 1000;
    public const int Max = 2100;
}

public sealed class UpdatePersonProfileValidator : AbstractValidator<UpdatePersonProfileCommand>
{
    private const int MinYear = ProfileYearBounds.Min;
    private const int MaxYear = ProfileYearBounds.Max;

    public UpdatePersonProfileValidator()
    {
        RuleFor(c => c.Id).NotEmpty().Matches("^p-\\d+$")
            .WithMessage("Person id must match the pattern 'p-<number>'.");
        RuleFor(c => c.EditorEmail).NotEmpty();
        RuleFor(c => c.Profile).NotNull();

        When(c => c.Profile is not null, () =>
        {
            RuleFor(c => c.Profile.BirthYear).InclusiveBetween(MinYear, MaxYear).When(c => c.Profile.BirthYear.HasValue);
            RuleFor(c => c.Profile.DeathYear).InclusiveBetween(MinYear, MaxYear).When(c => c.Profile.DeathYear.HasValue);
            RuleFor(c => c.Profile.BirthMonth).InclusiveBetween(1, 12).When(c => c.Profile.BirthMonth.HasValue);
            RuleFor(c => c.Profile.BirthDay).InclusiveBetween(1, 31).When(c => c.Profile.BirthDay.HasValue);
            RuleFor(c => c.Profile.DeathMonth).InclusiveBetween(1, 12).When(c => c.Profile.DeathMonth.HasValue);
            RuleFor(c => c.Profile.DeathDay).InclusiveBetween(1, 31).When(c => c.Profile.DeathDay.HasValue);
            RuleFor(c => c.Profile)
                .Must(p => !(p.BirthYear.HasValue && p.DeathYear.HasValue) || p.BirthYear!.Value <= p.DeathYear!.Value)
                .WithMessage("Birth year must not be after death year.");
            RuleFor(c => c.Profile.GivenName).Must(HaveLocaleWhenProvided).WithMessage("A provided given name must have at least one locale set.");
            RuleFor(c => c.Profile.Surname).Must(HaveLocaleWhenProvided).WithMessage("A provided surname must have at least one locale set.");
            RuleFor(c => c.Profile.MaidenName).Must(HaveLocaleWhenProvided).WithMessage("A provided maiden name must have at least one locale set.");
            RuleFor(c => c.Profile.MiddleName).Must(HaveLocaleWhenProvided).WithMessage("A provided middle name must have at least one locale set.");
            RuleFor(c => c.Profile.Sex).Must(BeParsableEnum<Sex>).WithMessage("Sex must be one of: male, female, unknown.");
            RuleFor(c => c.Profile.Vocation).Must(BeParsableEnum<Vocation>).WithMessage("Vocation is not a recognised value.");
            RuleFor(c => c.Profile.Residences)
                .Must(r => r is null || r.Count <= 10)
                .WithMessage("A person can have at most 10 residences.");
            RuleForEach(c => c.Profile.Residences).SetValidator(new ResidenceDtoValidator());
        });
    }

    // null/blank = "inherit seed" (fine). A provided value must parse to the enum, otherwise the
    // mapping would silently discard it (TryParse → null) and return 200 as if it had been saved.
    private static bool BeParsableEnum<TEnum>(string? value) where TEnum : struct, Enum =>
        string.IsNullOrWhiteSpace(value) || Enum.TryParse<TEnum>(value, ignoreCase: true, out _);

    // null name = "inherit seed" (fine). A provided name object must carry at least one locale.
    private static bool HaveLocaleWhenProvided(LocalizedTextDto? name)
    {
        if (name is null)
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(name.Ru)
            || !string.IsNullOrWhiteSpace(name.Be)
            || !string.IsNullOrWhiteSpace(name.En);
    }
}

public sealed class ResidenceDtoValidator : AbstractValidator<ResidenceDto>
{
    private const int MinYear = ProfileYearBounds.Min;
    private const int MaxYear = ProfileYearBounds.Max;

    public ResidenceDtoValidator()
    {
        RuleFor(r => r.Place)
            .Must(HaveLocale).WithMessage("A residence must have a place name in at least one locale.");
        RuleFor(r => r.FromYear).InclusiveBetween(MinYear, MaxYear).When(r => r.FromYear.HasValue);
        RuleFor(r => r.ToYear).InclusiveBetween(MinYear, MaxYear).When(r => r.ToYear.HasValue);
        RuleFor(r => r)
            .Must(r => !(r.FromYear.HasValue && r.ToYear.HasValue) || r.FromYear.Value <= r.ToYear.Value)
            .WithMessage("Residence 'from' year must not be after its 'to' year.");
        RuleFor(r => r.Lat).InclusiveBetween(-90, 90).When(r => r.Lat.HasValue);
        RuleFor(r => r.Lng).InclusiveBetween(-180, 180).When(r => r.Lng.HasValue);
        RuleFor(r => r.MapUrl).Must(BeGoogleMapsUrl).When(r => !string.IsNullOrEmpty(r.MapUrl))
            .WithMessage("Map URL must be a valid Google Maps http(s) URL at most 500 characters.");
        RuleFor(r => r.PlaceId).Must(BePlaceId).When(r => !string.IsNullOrEmpty(r.PlaceId))
            .WithMessage("Place ID must be an opaque Google token (letters, digits, '_' or '-'), at most 512 characters.");
    }

    // Google Maps place IDs are URL-safe base64-ish tokens; anything else has no business
    // being interpolated into the visitor's Maps link, so it is dropped rather than saved.
    private static bool BePlaceId(string? id) =>
        !string.IsNullOrEmpty(id) && id.Length <= 512 && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '-');

    /// <summary>Hosts that serve nothing but Maps, so any path on them qualifies.</summary>
    private static readonly HashSet<string> MapsOnlyHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "maps.google.com",
    };

    /// <summary>Google's general-purpose hosts. Allowed only on the /maps path — they also
    /// serve search, docs, and everything else, so host alone would let a plain
    /// google.com link pass a check whose message promises a Maps URL.</summary>
    private static readonly HashSet<string> GoogleHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "google.com",
        "www.google.com",
    };

    private static bool HaveLocale(LocalizedTextDto? p) =>
        p is not null && (!string.IsNullOrWhiteSpace(p.Ru) || !string.IsNullOrWhiteSpace(p.Be) || !string.IsNullOrWhiteSpace(p.En));

    private static bool BeGoogleMapsUrl(string? url) =>
        !string.IsNullOrEmpty(url)
        && url.Length <= 500
        && Uri.TryCreate(url, UriKind.Absolute, out var u)
        && (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps)
        && (MapsOnlyHosts.Contains(u.Host) || (GoogleHosts.Contains(u.Host) && BeMapsPath(u.AbsolutePath)));

    private static bool BeMapsPath(string path) =>
        path.Equals("/maps", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("/maps/", StringComparison.OrdinalIgnoreCase);
}
