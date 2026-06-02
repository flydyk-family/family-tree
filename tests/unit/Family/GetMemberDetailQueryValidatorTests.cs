using AwesomeAssertions;
using FamilyTree.Application.Family.GetMemberDetail;

namespace FamilyTree.UnitTests.Family;

public sealed class GetMemberDetailQueryValidatorTests
{
    private readonly GetMemberDetailQueryValidator _validator = new();

    [Fact]
    public void Validate_WhenIdIsEmpty_ShouldFailValidation()
    {
        var result = _validator.Validate(new GetMemberDetailQuery(Guid.Empty));

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void Validate_WhenIdProvided_ShouldPassValidation()
    {
        var result = _validator.Validate(new GetMemberDetailQuery(Guid.NewGuid()));

        result.IsValid.Should().BeTrue();
    }
}
