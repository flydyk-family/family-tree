using System.Text.Json.Serialization;
using FamilyTree.Api;
using FamilyTree.Application;
using FamilyTree.Application.Family.GetFamilyTree;
using FamilyTree.Application.Family.GetMemberDetail;
using FamilyTree.Infrastructure;
using MediatR;
using Microsoft.AspNetCore.Http.Json;

const string devCorsPolicy = "frontend-dev";

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddApplication();
builder.Services.AddInfrastructure();

builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddPolicy(devCorsPolicy, policy =>
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors(devCorsPolicy);
}

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

var api = app.MapGroup("/api");

api.MapGet("/family-tree", async (IMediator mediator, CancellationToken cancellationToken) =>
{
    var tree = await mediator.Send(new GetFamilyTreeQuery(), cancellationToken);
    return Results.Ok(tree);
});

api.MapGet("/members/{id:guid}", async (Guid id, IMediator mediator, CancellationToken cancellationToken) =>
{
    var member = await mediator.Send(new GetMemberDetailQuery(id), cancellationToken);
    return member is null ? Results.NotFound() : Results.Ok(member);
});

app.Run();

/// <summary>Exposed so the integration test host (<c>WebApplicationFactory</c>) can reference the entry point.</summary>
public partial class Program;
