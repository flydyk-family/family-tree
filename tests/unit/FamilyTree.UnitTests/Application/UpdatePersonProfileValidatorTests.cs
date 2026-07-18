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
}
