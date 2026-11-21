# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Central build configuration + version source of truth.
COPY Directory.Packages.props Directory.Build.props VERSION ./
# Backend source.
COPY src/backend/ ./src/backend/

RUN dotnet restore src/backend/FamilyTree.Api/FamilyTree.Api.csproj
# ImageSharp >= 3.2 fails Release builds without a Six Labors license key; it is
# passed as a BuildKit secret so it never lands in an image layer.
RUN --mount=type=secret,id=sixlabors_license_key,env=SixLaborsLicenseKey,required=true \
    dotnet publish src/backend/FamilyTree.Api/FamilyTree.Api.csproj \
    -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
# Run as the non-root user provided by the .NET runtime image.
USER $APP_UID
ENTRYPOINT ["dotnet", "FamilyTree.Api.dll"]
