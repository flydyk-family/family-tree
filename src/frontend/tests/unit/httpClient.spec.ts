import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getJson } from '@/api/httpClient'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getJson', () => {
  it('httpClient_whenResponseOk_shouldReturnParsedJson', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: 42 })
      })
    )

    const result = await getJson<{ value: number }>('/api/thing')

    expect(result).toEqual({ value: 42 })
  })

  it('httpClient_whenResponseNotOk_shouldThrowApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve(null)
      })
    )

    await expect(getJson('/api/missing')).rejects.toBeInstanceOf(ApiError)
  })
})
