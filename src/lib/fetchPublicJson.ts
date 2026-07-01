export async function fetchPublicJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = path.replace(/^\/+/, '')
  const response = await fetch(`${normalizedBase}${normalizedPath}`, {
    cache: 'force-cache',
    ...init,
  })

  if (!response.ok) {
    throw new Error(`Failed to load ${normalizedPath}: ${response.status}`)
  }

  return response.json() as Promise<T>
}
