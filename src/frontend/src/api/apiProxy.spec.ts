import { describe, it, expect } from 'vitest';
import { buildApiTargetUrl } from './apiProxy';

describe('buildApiTargetUrl', () => {
  it('forwards the path and query string to the API origin', () => {
    const result = buildApiTargetUrl(
      'https://app.pages.dev/api/family/graph?lang=en',
      'https://familytree-api.azurecontainerapps.io'
    );
    expect(result).toBe(
      'https://familytree-api.azurecontainerapps.io/api/family/graph?lang=en'
    );
  });

  it('strips a trailing slash from the API origin', () => {
    const result = buildApiTargetUrl(
      'https://app.pages.dev/api/people/p-0001',
      'https://familytree-api.azurecontainerapps.io/'
    );
    expect(result).toBe(
      'https://familytree-api.azurecontainerapps.io/api/people/p-0001'
    );
  });
});
