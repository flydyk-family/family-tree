using FluentValidation;
using MediatR;

namespace FamilyTree.Application.Behaviors;

/// <summary>
/// MediatR pipeline behavior that runs all registered FluentValidation validators for a request
/// and throws <see cref="ValidationException"/> when any fail. Establishes the validation pattern
/// that edit-mode commands will rely on.
/// </summary>
public sealed class ValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IReadOnlyList<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
    {
        _validators = validators.ToList();
    }

    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (_validators.Count == 0)
        {
            return await next();
        }

        var context = new ValidationContext<TRequest>(request);
        var results = await Task.WhenAll(_validators.Select(validator => validator.ValidateAsync(context, cancellationToken)));
        var failures = results.SelectMany(result => result.Errors).Where(failure => failure is not null).ToList();

        if (failures.Count > 0)
        {
            throw new ValidationException(failures);
        }

        return await next();
    }
}
