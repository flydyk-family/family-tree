import { describe, it, expect } from 'vitest';
import { buildApiTargetUrl, stripUnsafeUpstreamHeaders, applyOriginVerification } from './apiProxy';

describe('buildApiTargetUrl', () => {
  it('forwards the path and query string to the API origin', () => {
    const result = buildApiTargetUrl(
      'https://app.pages.dev/api/family/graph?lang=en',
      'https://familytree-api-abc123.europe-west1.run.app'
    );
    expect(result).toBe(
      'https://familytree-api-abc123.europe-west1.run.app/api/family/graph?lang=en'
    );
  });

  it('strips a trailing slash from the API origin', () => {
    const result = buildApiTargetUrl(
      'https://app.pages.dev/api/people/p-0001',
      'https://familytree-api-abc123.europe-west1.run.app/'
    );
    expect(result).toBe(
      'https://familytree-api-abc123.europe-west1.run.app/api/people/p-0001'
    );
  });

  it('trims surrounding whitespace from the API origin (a trailing space breaks the URL otherwise)', () => {
    const result = buildApiTargetUrl(
      'https://app.pages.dev/api/family/graph?lang=en',
      '  https://familytree-api-abc123.europe-west1.run.app  '
    );
    expect(result).toBe(
      'https://familytree-api-abc123.europe-west1.run.app/api/family/graph?lang=en'
    );
  });

  it('throws a clear error when the API origin is empty or whitespace-only', () => {
    expect(() =>
      buildApiTargetUrl('https://app.pages.dev/api/family/graph', '   ')
    ).toThrow(/API_ORIGIN/);
  });
});

describe('stripUnsafeUpstreamHeaders', () => {
  it('drops client-supplied forwarding headers so the API can not be IP/scheme-spoofed', () => {
    const headers = new Headers({
      'x-forwarded-for': '1.2.3.4',
      'x-forwarded-host': 'evil.example',
      'x-forwarded-proto': 'http',
      forwarded: 'for=1.2.3.4;proto=http',
    });

    stripUnsafeUpstreamHeaders(headers);

    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(headers.get('x-forwarded-host')).toBeNull();
    expect(headers.get('x-forwarded-proto')).toBeNull();
    expect(headers.get('forwarded')).toBeNull();
  });

  it('drops hop-by-hop and Host headers', () => {
    const headers = new Headers({
      host: 'app.pages.dev',
      connection: 'keep-alive',
      'transfer-encoding': 'chunked',
      upgrade: 'websocket',
    });

    stripUnsafeUpstreamHeaders(headers);

    expect(headers.get('host')).toBeNull();
    expect(headers.get('connection')).toBeNull();
    expect(headers.get('transfer-encoding')).toBeNull();
    expect(headers.get('upgrade')).toBeNull();
  });

  it('preserves Cookie and Authorization, which the API authenticates with', () => {
    const headers = new Headers({
      cookie: 'ft_session=abc',
      authorization: 'Bearer xyz',
      'content-type': 'application/json',
    });

    stripUnsafeUpstreamHeaders(headers);

    expect(headers.get('cookie')).toBe('ft_session=abc');
    expect(headers.get('authorization')).toBe('Bearer xyz');
    expect(headers.get('content-type')).toBe('application/json');
  });
});

describe('applyOriginVerification', () => {
  it('injects the X-Origin-Verify header when a secret is configured', () => {
    const headers = new Headers();
    applyOriginVerification(headers, 'top-secret');
    expect(headers.get('x-origin-verify')).toBe('top-secret');
  });

  it('overwrites any client-supplied X-Origin-Verify value', () => {
    const headers = new Headers({ 'x-origin-verify': 'forged-by-client' });
    applyOriginVerification(headers, 'top-secret');
    expect(headers.get('x-origin-verify')).toBe('top-secret');
  });

  it('is a no-op when the secret is undefined or empty', () => {
    const undef = new Headers();
    applyOriginVerification(undef, undefined);
    expect(undef.get('x-origin-verify')).toBeNull();

    const empty = new Headers();
    applyOriginVerification(empty, '');
    expect(empty.get('x-origin-verify')).toBeNull();
  });

  it('treats a whitespace-only secret as unset (no-op)', () => {
    const headers = new Headers();
    applyOriginVerification(headers, '   ');
    expect(headers.get('x-origin-verify')).toBeNull();
  });

  it('stripUnsafeUpstreamHeaders removes a client-supplied X-Origin-Verify', () => {
    const headers = new Headers({ 'x-origin-verify': 'forged-by-client' });
    stripUnsafeUpstreamHeaders(headers);
    expect(headers.get('x-origin-verify')).toBeNull();
  });
});
