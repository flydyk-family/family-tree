using System.Diagnostics.CodeAnalysis;
using Amazon.S3;
using Amazon.S3.Model;
using FamilyTree.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FamilyTree.Infrastructure;

/// <summary>Writes media objects to Cloudflare R2 via its S3-compatible API. Selected in
/// deployment when R2 credentials are configured.</summary>
[ExcludeFromCodeCoverage]
public sealed class R2MediaStore : IMediaStore
{
    private readonly IAmazonS3 _client;
    private readonly string _bucket;
    private readonly ILogger<R2MediaStore> _logger;

    public R2MediaStore(IOptions<R2Options> options, ILogger<R2MediaStore> logger)
    {
        var r2 = options.Value;
        _bucket = r2.Bucket;
        _logger = logger;
        _client = new AmazonS3Client(r2.AccessKeyId, r2.SecretAccessKey, new AmazonS3Config
        {
            ServiceURL = $"https://{r2.AccountId}.r2.cloudflarestorage.com",
            // R2 requires path-style addressing and a placeholder region.
            ForcePathStyle = true,
            AuthenticationRegion = "auto"
        });
    }

    public async Task PutAsync(string key, ReadOnlyMemory<byte> bytes, string contentType, CancellationToken cancellationToken)
    {
        using var stream = new MemoryStream(bytes.ToArray());
        await _client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = _bucket,
            Key = key,
            InputStream = stream,
            ContentType = contentType,
            DisablePayloadSigning = true   // R2 does not support streaming SHA-256 chunked signing.
        }, cancellationToken);
        _logger.LogInformation("Stored media object {Key} ({Bytes} bytes).", key, bytes.Length);
    }

    public async Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        await _client.DeleteObjectAsync(new DeleteObjectRequest
        {
            BucketName = _bucket,
            Key = key
        }, cancellationToken);
        _logger.LogInformation("Deleted media object {Key}.", key);
    }
}
