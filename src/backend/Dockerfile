# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Central build configuration + version source of truth.
COPY Directory.Packages.props Directory.Build.props VERSION ./
# Backend source.
COPY src/backend/ ./src/backend/

RUN dotnet restore src/backend/FamilyTree.Api/FamilyTree.Api.csproj
RUN dotnet publish src/backend/FamilyTree.Api/FamilyTree.Api.csproj \
    -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
# Run as the non-root user provided by the .NET runtime image.
USER $APP_UID
ENTRYPOINT ["dotnet", "FamilyTree.Api.dll"]
