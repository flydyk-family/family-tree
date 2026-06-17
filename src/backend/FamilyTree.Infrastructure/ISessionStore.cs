namespace FamilyTree.Infrastructure;

public interface ISessionStore
{
    Task<string> CreateAsync(Session session, CancellationToken cancellationToken);
    Task<Session?> GetAsync(string token, CancellationToken cancellationToken);
    Task RenewAsync(string token, DateTimeOffset newExpiresAt, CancellationToken cancellationToken);
    Task DeleteAsync(string token, CancellationToken cancellationToken);
}
