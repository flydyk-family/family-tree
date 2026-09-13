using FamilyTree.Api.Family;
using Microsoft.AspNetCore.Http;

namespace FamilyTree.UnitTests.Api;

public sealed class PhotoUploadPathTests
{
    [Theory]
    [InlineData("/api/people/p-0001/photos", true)]
    [InlineData("/api/families/kowalski/people/p-0001/photos", true)]
    [InlineData("/api/people/p-0001/biography", false)]
    [InlineData("/api/families/kowalski/people/p-0001/profile", false)]
    [InlineData("/api/families/kowalski/graph", false)]
    [InlineData("/api/families/kowalski/people/photos", false)]
    public void IsMatch_WhenGivenAPath_ShouldMatchOnlyPhotoUploadRoutes(string path, bool expected) =>
        PhotoUploadPath.IsMatch(new PathString(path)).Should().Be(expected);
}
