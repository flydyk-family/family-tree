using FamilyTree.Application;
using FamilyTree.Application.Abstractions;
using FamilyTree.Application.People;
using FamilyTree.Domain;
using MapsterMapper;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace FamilyTree.UnitTests.Application;

public sealed class ApplicationRegistrationTests
{
    [Fact]
    public void AddApplication_WhenResolvingMediator_ShouldDispatchGetAllPeople()
    {
        var services = new ServiceCollection();

        // Application needs an IFamilyQueryService; supply a stub.
        var service = new Mock<IFamilyQueryService>();
        service.Setup(s => s.GetAllPeopleAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<Person>());

        services.AddApplication();
        services.AddSingleton(service.Object);

        var provider = services.BuildServiceProvider();
        var sender = provider.GetRequiredService<ISender>();
        provider.GetRequiredService<IMapper>().Should().NotBeNull();

        var act = async () => await sender.Send(new GetAllPeopleQuery());

        act.Should().NotThrowAsync();
    }
}
