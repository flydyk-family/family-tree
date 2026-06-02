using FamilyTree.Application.Behaviors;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.People;
using FluentValidation;
using FluentValidation.TestHelper;

namespace FamilyTree.UnitTests.Application;

public sealed class ValidationTests
{
    [Theory]
    [InlineData("")]
    [InlineData("invalid")]
    [InlineData("x-0001")]
    public void Validate_WhenIdMalformed_ShouldHaveError(string id)
    {
        var validator = new GetPersonByIdQueryValidator();

        var result = validator.TestValidate(new GetPersonByIdQuery(id));

        result.ShouldHaveValidationErrorFor(query => query.Id);
    }

    [Fact]
    public void Validate_WhenIdWellFormed_ShouldNotHaveError()
    {
        var validator = new GetPersonByIdQueryValidator();

        var result = validator.TestValidate(new GetPersonByIdQuery("p-0001"));

        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public async Task Handle_WhenRequestInvalid_ShouldThrowValidationException()
    {
        var behavior = new ValidationBehavior<GetPersonByIdQuery, PersonDto?>(
            new[] { new GetPersonByIdQueryValidator() });

        var act = () => behavior.Handle(
            new GetPersonByIdQuery("invalid"),
            _ => Task.FromResult<PersonDto?>(null),
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
    }

    [Fact]
    public async Task Handle_WhenRequestValid_ShouldCallNext()
    {
        var behavior = new ValidationBehavior<GetPersonByIdQuery, PersonDto?>(
            new[] { new GetPersonByIdQueryValidator() });
        var nextCalled = false;

        await behavior.Handle(
            new GetPersonByIdQuery("p-0001"),
            _ =>
            {
                nextCalled = true;
                return Task.FromResult<PersonDto?>(null);
            },
            CancellationToken.None);

        nextCalled.Should().BeTrue();
    }
}
