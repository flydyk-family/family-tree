using System.Reflection;
using FamilyTree.Application;
using FamilyTree.Infrastructure;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

// MediatR licence key comes from configuration (MediatR:LicenseKey) — set it
// via user-secrets locally or the MediatR__LicenseKey env var in deployment;
// it is never committed.
builder.Services.AddApplication(builder.Configuration["MediatR:LicenseKey"]);
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddHealthChecks();

const string DevCorsPolicy = "frontend-dev";
builder.Services.AddCors(options =>
{
    options.AddPolicy(DevCorsPolicy, policy =>
        policy.WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

app.UseExceptionHandler(handler =>
{
    handler.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        if (feature?.Error is ValidationException validationException)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(new
            {
                title = "Validation failed",
                errors = validationException.Errors
                    .Select(error => new { error.PropertyName, error.ErrorMessage })
            });
        }
        else
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { title = "An unexpected error occurred." });
        }
    });
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors(DevCorsPolicy);
}

app.UseStaticFiles();
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        var version = typeof(Program).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion ?? "unknown";
        var commit = Environment.GetEnvironmentVariable("APP_COMMIT") ?? "local";
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            status = report.Status.ToString(),
            version,
            commit
        });
    }
});
app.MapControllers();

app.Run();

public partial class Program { }
