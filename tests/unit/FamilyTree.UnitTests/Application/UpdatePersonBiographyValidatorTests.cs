using FamilyTree.Application.Dtos;
using FamilyTree.Application.People;

namespace FamilyTree.UnitTests.Application;

public sealed class UpdatePersonBiographyValidatorTests
{
    private readonly UpdatePersonBiographyValidator _validator = new();

    [Fact]
    public async Task Validate_WhenAllFieldsValid_ShouldPass()
    {
        var command = new UpdatePersonBiographyCommand("p-0001", new LocalizedTextDto("био", null, null), "editor@example.com");

        var result = await _validator.ValidateAsync(command, CancellationToken.None);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public async Task Validate_WhenIdMalformed_ShouldFail()
    {
        var command = new UpdatePersonBiographyCommand("not-an-id", new LocalizedTextDto("био", null, null), "editor@example.com");

        var result = await _validator.ValidateAsync(command, CancellationToken.None);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_WhenBiographyAllEmpty_ShouldFail()
    {
        var command = new UpdatePersonBiographyCommand("p-0001", new LocalizedTextDto(null, null, null), "editor@example.com");

        var result = await _validator.ValidateAsync(command, CancellationToken.None);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_WhenEditorEmailEmpty_ShouldFail()
    {
        var command = new UpdatePersonBiographyCommand("p-0001", new LocalizedTextDto("био", null, null), "");

        var result = await _validator.ValidateAsync(command, CancellationToken.None);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public async Task Validate_WhenBiographyNull_ShouldFail()
    {
        var command = new UpdatePersonBiographyCommand("p-0001", null!, "editor@example.com");

        var result = await _validator.ValidateAsync(command, CancellationToken.None);

        result.IsValid.Should().BeFalse();
    }
}
