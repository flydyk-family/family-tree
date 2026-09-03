using FamilyTree.Application.Dtos;
using FamilyTree.Application.People;

namespace FamilyTree.UnitTests.Application;

public sealed class UpdatePersonProfileValidatorTests
{
    private static UpdatePersonProfileCommand Cmd(PersonProfileDto profile, string id = "p-1") =>
        new(id, profile, "e@x");

    private static readonly UpdatePersonProfileValidator Validator = new();

    [Fact]
    public void Validate_WhenBirthAfterDeath_ShouldFail()
    {
        var result = Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, null, 1950, null, null, 1900, null, null, null)));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenYearOutOfBounds_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, null, 3000, null, null, null, null, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenProvidedNameAllBlank_ShouldFail()
    {
        var blank = new LocalizedTextDto("", "", "");
        Validator.Validate(Cmd(new PersonProfileDto(null, blank, null, null, null, null, null, null, null, null, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenMiddleNameAllBlank_ShouldFail()
    {
        var blank = new LocalizedTextDto("", "", "");
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, blank, null, null, null, null, null, null, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenOnlyBirthYearSet_ShouldPass()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, null, 1897, null, null, null, null, null, null))).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenIdMalformed_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, null, 1897, null, null, null, null, null, null), id: "bad")).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenSexUnparseable_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null,"mal", null, null, null, null, null, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenVocationUnparseable_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, null, null, null, null, null, null, null, "wizard"))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenSexValidLowercase_ShouldPass()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null,"female", null, null, null, null, null, null, "teacher"))).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenMonthOutOfRange_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, null, 1901, 13, null, null, null, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenDayOutOfRange_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, null, 1901, 5, 40, null, null, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenDeathMonthOutOfRange_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, null, null, null, null, 1980, 13, null, null))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenDeathDayOutOfRange_ShouldFail()
    {
        Validator.Validate(Cmd(new PersonProfileDto(null, null, null, null, null, null, null, null, 1980, 5, 40, null))).IsValid.Should().BeFalse();
    }

    private static ResidenceDto Res(string en = "Kraków", int? from = 1900, int? to = 1910,
        double? lat = 50.0, double? lng = 19.0, string? mapUrl = null, string? placeId = null) =>
        new(new LocalizedTextDto(null, null, en), from, to, lat, lng, mapUrl, placeId);

    private static UpdatePersonProfileCommand CommandWith(params ResidenceDto[] residences) =>
        new("p-1", new PersonProfileDto(null, null, null, null, null, null, null, null, null, null, null, null, residences), "e@x");

    [Fact]
    public void Validate_WhenResidenceHasNoPlaceLocale_ShouldFail()
    {
        var result = Validator.Validate(
            CommandWith(new ResidenceDto(new LocalizedTextDto(null, null, null), 1900, 1910, null, null, null)));
        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenResidenceFromAfterTo_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(from: 1950, to: 1900)))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenLatOutOfRange_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(lat: 999)))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenMapUrlNotHttp_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(mapUrl: "javascript:alert(1)")))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenPlaceIdIsAnOpaqueToken_ShouldPass()
    {
        Validator.Validate(CommandWith(Res(placeId: "ChIJ0RhONcBEFkcRv4pHdrW2a7Q")))
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenPlaceIdHasUrlBreakingCharacters_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(placeId: "ChIJ /@evil?x")))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenPlaceIdLongerThan512Chars_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(placeId: new string('a', 513))))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenMoreThanTenResidences_ShouldFail()
    {
        var many = Enumerable.Range(0, 11).Select(_ => Res()).ToArray();
        Validator.Validate(CommandWith(many)).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenResidenceValid_ShouldPass()
    {
        Validator.Validate(
            CommandWith(Res(mapUrl: "https://www.google.com/maps/search/?api=1&query=50,19")))
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenLngOutOfRange_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(lng: 999)))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenResidenceYearOutOfBounds_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(from: 999)))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenMapUrlLongerThan500Chars_ShouldFail()
    {
        var longUrl = "https://example.com/" + new string('a', 500);
        Validator.Validate(CommandWith(Res(mapUrl: longUrl)))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenExactlyTenResidences_ShouldPass()
    {
        var ten = Enumerable.Range(0, 10).Select(_ => Res()).ToArray();
        Validator.Validate(CommandWith(ten)).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenToYearOutOfBounds_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(to: 2101)))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenYearsAtInclusiveBoundary_ShouldPass()
    {
        Validator.Validate(CommandWith(Res(from: 1000, to: 2100)))
            .IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenLatAtInclusiveBoundary_ShouldPass()
    {
        Validator.Validate(CommandWith(Res(lat: -90))).IsValid.Should().BeTrue();
        Validator.Validate(CommandWith(Res(lat: 90))).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenLatJustOutsideBoundary_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(lat: -90.0001))).IsValid.Should().BeFalse();
        Validator.Validate(CommandWith(Res(lat: 90.0001))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenLngAtInclusiveBoundary_ShouldPass()
    {
        Validator.Validate(CommandWith(Res(lng: -180))).IsValid.Should().BeTrue();
        Validator.Validate(CommandWith(Res(lng: 180))).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Validate_WhenLngJustOutsideBoundary_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(lng: -180.0001))).IsValid.Should().BeFalse();
        Validator.Validate(CommandWith(Res(lng: 180.0001))).IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenMapUrlNotGoogleMaps_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(mapUrl: "https://evil.example.com/maps")))
            .IsValid.Should().BeFalse();
    }

    // Pins the exact-host-match behavior against a later regression (e.g. a well-meaning
    // switch from HashSet.Contains to Uri.Host.Contains/StartsWith).
    [Fact]
    public void Validate_WhenMapUrlIsLookalikeGoogleHost_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(mapUrl: "https://www.google.com.evil.com/maps")))
            .IsValid.Should().BeFalse();
        Validator.Validate(CommandWith(Res(mapUrl: "https://evil.com/?redirect=www.google.com")))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenMapUrlIsGoogleMapsHost_ShouldPass()
    {
        Validator.Validate(CommandWith(Res(mapUrl: "https://www.google.com/maps/search/?api=1&query=50,19")))
            .IsValid.Should().BeTrue();
        Validator.Validate(CommandWith(Res(mapUrl: "https://maps.google.com/?q=Kraków")))
            .IsValid.Should().BeTrue();
    }

    /// <summary>google.com serves far more than Maps, so the bare hosts are accepted only on
    /// the /maps path — otherwise the check passes URLs its own message calls invalid.</summary>
    [Fact]
    public void Validate_WhenMapUrlIsGoogleHostButNotAMapsPath_ShouldFail()
    {
        Validator.Validate(CommandWith(Res(mapUrl: "https://www.google.com/search?q=minsk")))
            .IsValid.Should().BeFalse();
        Validator.Validate(CommandWith(Res(mapUrl: "https://google.com/")))
            .IsValid.Should().BeFalse();
        // A path merely *starting* with the letters "maps" is not the /maps path.
        Validator.Validate(CommandWith(Res(mapUrl: "https://www.google.com/mapsomething")))
            .IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenMapUrlIsBareMapsPathOnAGoogleHost_ShouldPass()
    {
        Validator.Validate(CommandWith(Res(mapUrl: "https://www.google.com/maps")))
            .IsValid.Should().BeTrue();
        Validator.Validate(CommandWith(Res(mapUrl: "https://google.com/maps/@53.9,27.5,12z")))
            .IsValid.Should().BeTrue();
    }

    /// <summary>The residences editor parses the row index out of these names to show each
    /// message against the row that caused it, so the indexed shape is a contract, not an
    /// incidental detail of FluentValidation's default naming.</summary>
    [Fact]
    public void Validate_WhenASpecificResidenceRowIsInvalid_ShouldNameThatRowsIndexedProperty()
    {
        var result = Validator.Validate(CommandWith(Res(), Res(from: 1950, to: 1900)));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(e => e.PropertyName == "Profile.Residences[1]");
    }

    [Fact]
    public void Validate_WhenSeveralResidenceRowsAreInvalid_ShouldReportEachRowSeparately()
    {
        var result = Validator.Validate(CommandWith(Res(lat: 999), Res(), Res(lng: 999)));

        result.Errors.Select(e => e.PropertyName).Should()
            .Contain("Profile.Residences[0].Lat")
            .And.Contain("Profile.Residences[2].Lng");
    }
}
