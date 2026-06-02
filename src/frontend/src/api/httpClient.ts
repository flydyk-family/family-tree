/** Error thrown when the API responds with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

/** Typed GET helper: parses JSON on success, throws {@link ApiError} otherwise. */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    signal
  })

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with status ${response.status}`)
  }

  return (await response.json()) as T
}
