import { describe, it, expect, vi, afterEach } from 'vitest';
import { putBiography } from './biographyApi';
import type { LocalizedText, PersonDetail } from '../types/family';

afterEach(() => { vi.restoreAllMocks(); });

const payload: LocalizedText = { ru: 'Жизнеописание', be: null, en: 'A life.' };
const updated = { id: 'p-0016', biography: payload } as unknown as PersonDetail;

describe('putBiography', () => {
  it('PUTs the biography with credentials and returns the updated person', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => updated });
    vi.stubGlobal('fetch', fetchMock);

    const result = await putBiography('p-0016', payload);

    expect(fetchMock).toHaveBeenCalledWith('/api/people/p-0016/biography', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    expect(result).toEqual(updated);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(putBiography('p-0016', payload)).rejects.toThrow('403');
  });
});
