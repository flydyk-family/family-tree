using AwesomeAssertions;
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Family.GetMemberDetail;
using FamilyTree.Application.Mapping;
using FamilyTree.Domain;
using Moq;

namespace FamilyTree.UnitTests.Family;

public sealed class GetMemberDetailQueryHandlerTests
{
    private static readonly Guid MemberId = Guid.Parse("66666666-6666-6666-6666-666666666666");

    [Fact]
    public async Task Handle_WhenMemberExists_ShouldReturnDetailWithFormattedAndMappedFields()
    {
        var person = new Person
        {
            Id = MemberId,
            GivenName = "Anna",
            FamilyName = "Bauer",
            Sex = Sex.Female,
            BirthDate = new PartialDate(1801),
            DeathDate = new PartialDate(1879, 4, 9),
            BirthPlace = "Lindau",
            KeyFacts = ["Schoolteacher"],
            Bio = "A teacher and botanical illustrator.",
            SocialLinks = [new SocialLink("wikipedia", "https://example.org/anna")]
        };
        var handler = new GetMemberDetailQueryHandler(RepositoryReturning(person), new PersonMapper());

        var result = await handler.Handle(new GetMemberDetailQuery(MemberId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.DisplayName.Should().Be("Anna Bauer");
        result.BirthDateText.Should().Be("1801");
        result.DeathDateText.Should().Be("9 Apr 1879");
        result.SocialLinks.Should().ContainSingle(link => link.Kind == "wikipedia" && link.Url == "https://example.org/anna");
    }

    [Fact]
    public async Task Handle_WhenMemberMissing_ShouldReturnNull()
    {
        var handler = new GetMemberDetailQueryHandler(RepositoryReturning(null), new PersonMapper());

        var result = await handler.Handle(new GetMemberDetailQuery(MemberId), CancellationToken.None);

        result.Should().BeNull();
    }

    private static IFamilyRepository RepositoryReturning(Person? person)
    {
        var repository = new Mock<IFamilyRepository>();
        repository
            .Setup(repo => repo.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(person);
        return repository.Object;
    }
}
