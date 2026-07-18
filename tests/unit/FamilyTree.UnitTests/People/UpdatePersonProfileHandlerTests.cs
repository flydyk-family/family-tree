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
        snapshot.Setup(s => s.GetSeedAsync(It.IsAny<CancellationToken>())).Returns(ValueTask.FromResult(new FamilyGraph([person], [])));
        var validator = new Mock<IFamilyGraphValidator>();
        validator.Setup(v => v.ValidateBirthYear(It.IsAny<FamilyGraph>(), "p-1", 1897)).Returns(GraphValidationResult.Ok());
        var handler = new UpdatePersonProfileHandler(service.Object, store.Object, snapshot.Object, validator.Object, Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var result = await handler.Handle(
            new UpdatePersonProfileCommand("p-1", new PersonProfileDto(null, null, null, null, null, 1897, null, null, null, null, null, null), "e@x"),
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
            new UpdatePersonProfileCommand("p-1", new PersonProfileDto(null, null, null, null, null, 1500, null, null, null, null, null, null), "e@x"),
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
        store.Verify(s => s.AppendProfileAsync(It.IsAny<string>(), It.IsAny<PersonProfileOverride>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenReplacementDropsMonthLeavingDayWithoutSeedMonth_ShouldThrowAndNotAppend()
    {
        // Seed p-1 has a year but no month/day. A whole-document replace that supplies a day while
        // omitting the month renders as day-without-month once the seed baseline reasserts, so it
        // must be rejected against the SEED (not against any prior override) before it is persisted.
        var person = TestPeople.Person("p-1", birthYear: 1898);
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-1", It.IsAny<CancellationToken>())).ReturnsAsync(person);
        service.Setup(s => s.GetGraphAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new FamilyGraph([person], []));
        var store = new Mock<IPersonOverrideStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();
        snapshot.Setup(s => s.GetSeedAsync(It.IsAny<CancellationToken>())).Returns(ValueTask.FromResult(new FamilyGraph([person], [])));
        var validator = new Mock<IFamilyGraphValidator>();
        validator.Setup(v => v.ValidateBirthYear(It.IsAny<FamilyGraph>(), "p-1", 1898)).Returns(GraphValidationResult.Ok());
        var handler = new UpdatePersonProfileHandler(service.Object, store.Object, snapshot.Object, validator.Object, Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var act = () => handler.Handle(
            new UpdatePersonProfileCommand("p-1", new PersonProfileDto(null, null, null, null, null, 1898, null, 15, null, null, null, null), "e@x"),
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
        store.Verify(s => s.AppendProfileAsync(It.IsAny<string>(), It.IsAny<PersonProfileOverride>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task Handle_WhenPersonAbsentFromSeed_ShouldTreatSeedBaselineAsEmptyAndSucceed()
    {
        // Defensive: the person resolves from the merged snapshot but is absent from the raw seed
        // (an override-only record). Seed date fields coalesce to null, so a year-only edit still
        // validates and persists rather than throwing on the null seed.
        var person = TestPeople.Person("p-1", birthYear: 1898);
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-1", It.IsAny<CancellationToken>())).ReturnsAsync(person);
        service.Setup(s => s.GetGraphAsync(It.IsAny<CancellationToken>())).ReturnsAsync(new FamilyGraph([person], []));
        var store = new Mock<IPersonOverrideStore>();
        var snapshot = new Mock<IFamilySnapshotProvider>();
        snapshot.Setup(s => s.GetSeedAsync(It.IsAny<CancellationToken>())).Returns(ValueTask.FromResult(new FamilyGraph([], [])));
        var validator = new Mock<IFamilyGraphValidator>();
        validator.Setup(v => v.ValidateBirthYear(It.IsAny<FamilyGraph>(), "p-1", 1897)).Returns(GraphValidationResult.Ok());
        var handler = new UpdatePersonProfileHandler(service.Object, store.Object, snapshot.Object, validator.Object, Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var result = await handler.Handle(
            new UpdatePersonProfileCommand("p-1", new PersonProfileDto(null, null, null, null, null, 1897, null, null, null, null, null, null), "e@x"),
            CancellationToken.None);

        result.Should().NotBeNull();
        store.Verify(s => s.AppendProfileAsync("p-1", It.IsAny<PersonProfileOverride>(), "e@x", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Handle_WhenPersonMissing_ShouldReturnNull()
    {
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetPersonAsync("p-9", It.IsAny<CancellationToken>())).ReturnsAsync((Person?)null);
        var handler = new UpdatePersonProfileHandler(service.Object, Mock.Of<IPersonOverrideStore>(), Mock.Of<IFamilySnapshotProvider>(), Mock.Of<IFamilyGraphValidator>(), Mapper(), NullLogger<UpdatePersonProfileHandler>.Instance);

        var result = await handler.Handle(new UpdatePersonProfileCommand("p-9", new PersonProfileDto(null, null, null, null, null, 1897, null, null, null, null, null, null), "e@x"), CancellationToken.None);

        result.Should().BeNull();
    }
}
