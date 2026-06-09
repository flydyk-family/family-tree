import { describe, it, expect } from 'vitest';
import { buildApiTargetUrl } from './apiProxy';

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
