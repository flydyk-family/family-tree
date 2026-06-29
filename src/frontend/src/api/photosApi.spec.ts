import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadPhoto, deletePortrait, promoteGalleryPhoto, deleteGalleryPhoto } from './photosApi';

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

describe('photosApi', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('uploadPhoto posts multipart with credentials', async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ id: 'p-0001' }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' });

    await uploadPhoto('p-0001', file, 'portrait');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/people/p-0001/photos');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('role')).toBe('portrait');
  });

  it('throws on non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response));
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' });
    await expect(uploadPhoto('p-0001', file, 'gallery')).rejects.toThrow();
  });

  it('promoteGalleryPhoto posts to the promote route', async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ id: 'p-0001' }));
    vi.stubGlobal('fetch', fetchMock);
    await promoteGalleryPhoto('p-0001', 'h2');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/people/p-0001/photos/gallery/h2/promote');
  });

  it('deletePortrait calls DELETE', async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ id: 'p-0001' }));
    vi.stubGlobal('fetch', fetchMock);
    await deletePortrait('p-0001');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('deleteGalleryPhoto calls DELETE on gallery route', async () => {
    const fetchMock = vi.fn().mockReturnValue(ok({ id: 'p-0001' }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteGalleryPhoto('p-0001', 'photo-123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/people/p-0001/photos/gallery/photo-123');
    expect(init.method).toBe('DELETE');
  });
});
