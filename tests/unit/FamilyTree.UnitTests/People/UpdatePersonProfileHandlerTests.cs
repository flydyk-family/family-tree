using FamilyTree.Application.Abstractions;
using FamilyTree.Application.Dtos;
using FamilyTree.Application.Mapping;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using FluentValidation;
using Mapster;
using MapsterMapper;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace FamilyTree.UnitTests.People;

public sealed class UpdatePersonProfileHandlerTests
{
    private static IMapper Mapper()
    {
        var config = new TypeAdapterConfig();
        MappingConfig.Register(config);
        return new Mapper(config);
    }

    [Fact]
    public async Task Handle_WhenValid_ShouldAppendAndRefreshAndReturnMerged()
    {
        var person = TestPeople.Person("p-1", birthYear: 1898);
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-1", It.IsAny<CancellationToken>())).ReturnsAsync(person);
        service.Setup(s => s.GetGraphAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new FamilyGraph([person], []));
        var store = new Mock<IPersonOverrideStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();
        var validator = new Mock<IFamilyGraphValidator>();
        validator.Setup(v => v.ValidateBirthYear(It.IsAny<FamilyGraph>(), "p-1", 1897)).Returns(GraphValidationResult.Ok());
        var handler = new UpdatePersonProfileHandler(service.Object, store.Object, snapshot.Object, validator.Object, Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var result = await handler.Handle(
            new UpdatePersonProfileCommand("p-1", new PersonProfileDto(null, null, null, null, 1897, null, null, null, null, null, null), "e@x"),
            CancellationToken.None);

        result.Should().NotBeNull();
        store.Verify(s => s.AppendProfileAsync("p-1", It.Is<PersonProfileOverride>(p => p.BirthYear == 1897), "e@x", It.IsAny<CancellationToken>()), Times.Once);
        snapshot.Verify(s => s.RefreshAsync(It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenCrossEntityInvalid_ShouldThrowAndNotAppend()
    {
        var person = TestPeople.Person("p-1", birthYear: 1898);
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-1", It.IsAny<CancellationToken>())).ReturnsAsync(person);
        service.Setup(s => s.GetGraphAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new FamilyGraph([person], []));
        var store = new Mock<IPersonOverrideStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();
        var validator = new Mock<IFamilyGraphValidator>();
        validator.Setup(v => v.ValidateBirthYear(It.IsAny<FamilyGraph>(), "p-1", 1500)).Returns(GraphValidationResult.Fail("bad"));
        var handler = new UpdatePersonProfileHandler(service.Object, store.Object, snapshot.Object, validator.Object, Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var act = () => handler.Handle(
            new UpdatePersonProfileCommand("p-1", new PersonProfileDto(null, null, null, null, 1500, null, null, null, null, null, null), "e@x"),
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
        store.Verify(s => s.AppendProfileAsync(It.IsAny<string>(), It.IsAny<PersonProfileOverride>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-9", It.IsAny<CancellationToken>())).ReturnsAsync((Person?)null);
        var handler = new UpdatePersonProfileHandler(service.Object, Mock.Of<IPersonOverrideStore>(), Mock.Of<IFamilySnapshotProvider>(), Mock.Of<IFamilyGraphValidator>(), Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var result = await handler.Handle(new UpdatePersonProfileCommand("p-9", new PersonProfileDto(null, null, null, null, 1897, null, null, null, null, null, null), "e@x"), CancellationToken.None);

        result.Should().BeNull();
    }
}
