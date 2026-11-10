const BASE = '/v1'
const REFRESH_KEY = 'voxsafe.refresh'

let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null
let refreshInFlight: Promise<boolean> | null = null

export class ApiError extends Error {
  status: number
  detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `request failed (${status})`)
    this.status = status
    this.detail = detail
  }

  get messageText(): string {
    const firstMessage = (value: unknown): string | null => {
      if (typeof value === 'string') return value
      if (Array.isArray(value)) {
        for (const item of value) {
          const msg = firstMessage(item)
          if (msg) return msg
        }
        return null
      }
      if (value && typeof value === 'object') {
        const record = value as { msg?: unknown; detail?: unknown; message?: unknown }
        if (typeof record.msg === 'string') return record.msg
        if (typeof record.detail === 'string') return record.detail
        if (record.detail !== undefined) {
          const nested = firstMessage(record.detail)
          if (nested) return nested
        }
        if (typeof record.message === 'string') return record.message
      }
      return null
    }

    return firstMessage(this.detail) ?? this.message
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

export function getStoredRefresh(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function storeRefresh(token: string | null) {
  try {
    if (token) sessionStorage.setItem(REFRESH_KEY, token)
    else sessionStorage.removeItem(REFRESH_KEY)
  } catch {
    /* session storage may be unavailable in private modes */
  }
}

export function clearSession() {
  accessToken = null
  storeRefresh(null)
}

/**
 * Resolve an API path against the version prefix exactly once. The API returns
 * some server-relative URLs that already carry `/v1` (audio, for example), and
 * both forms must resolve to the same endpoint.
 */
export function apiUrl(path: string): string {
  return path.startsWith(`${BASE}/`) ? path : `${BASE}${path}`
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  const token = getStoredRefresh()
  if (!token) return false

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: token }),
      })
      if (!res.ok) {
        clearSession()
        return false
      }
      const data = (await res.json()) as {
        access_token: string
        refresh_token: string
      }
      accessToken = data.access_token
      storeRefresh(data.refresh_token)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

interface RequestOptions extends RequestInit {
  retryOnAuth?: boolean
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { retryOnAuth = true, headers, ...rest } = options
  const res = await fetch(apiUrl(path), {
    ...rest,
    headers: {
      ...(headers || {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  })

  if (res.status === 401 && retryOnAuth && (await refreshSession())) {
    return apiRequest<T>(path, { ...options, retryOnAuth: false })
  }
  if (res.status === 401) {
    clearSession()
    onSessionExpired?.()
  }
  if (!res.ok) {
    throw new ApiError(res.status, await readBody(res))
  }
  if (res.status === 204) return undefined as T
  return (await readBody(res)) as T
}

/** Fetch a private resource (audio) with bearer auth and one refresh retry. */
export async function fetchAuthorizedBlob(
  path: string,
  retryOnAuth = true,
): Promise<Blob> {
  const res = await fetch(apiUrl(path), {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  })
  if (res.status === 401 && retryOnAuth && (await refreshSession())) {
    return fetchAuthorizedBlob(path, false)
  }
  if (res.status === 401) {
    clearSession()
    onSessionExpired?.()
  }
  if (!res.ok) {
    throw new ApiError(res.status, await readBody(res))
  }
  return res.blob()
}

/* ---------------------------------------------------------------- auth ---- */

export const authApi = {
  async login(email: string, password: string) {
    const data = await apiRequest<{
      access_token: string
      refresh_token: string
      expires_in: number
      user: import('./types').User
    }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    accessToken = data.access_token
    storeRefresh(data.refresh_token)
    return data
  },

  async restore() {
    const ok = await refreshSession()
    if (!ok) return null
    return apiRequest<import('./types').User>('/auth/me')
  },

  async logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
    } finally {
      clearSession()
    }
  },
}

/* --------------------------------------------------------------- calls ---- */

export const callsApi = {
  list: (limit = 25) =>
    apiRequest<{ calls: import('./types').CallSummary[]; total: number }>(
      `/calls?limit=${limit}`,
    ),

  create: (payload: {
    original_filename: string
    size_bytes?: number
    recording_date?: string | null
    consent_confirmed: boolean
    consent_reference?: string | null
  }) =>
    apiRequest<import('./types').CallSummary>('/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'upload', ...payload }),
    }),

  timeline: (id: string) =>
    apiRequest<import('./types').TimelineResponse>(`/calls/${id}/timeline`),

  audit: (id: string) =>
    apiRequest<{ events: import('./types').AuditEvent[] }>(`/calls/${id}/audit`),

  upload(
    callId: string,
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<import('./types').UploadAccepted> {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)

      const send = (retried = false) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${BASE}/calls/${callId}/audio`)
        if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100))
          }
        }
        xhr.onload = async () => {
          let body: unknown = null
          try {
            body = JSON.parse(xhr.responseText)
          } catch {
            body = xhr.responseText
          }
          if (xhr.status === 401 && !retried && (await refreshSession())) {
            send(true)
            return
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(body as import('./types').UploadAccepted)
          } else {
            reject(new ApiError(xhr.status, body))
          }
        }
        xhr.onerror = () => reject(new ApiError(0, 'network error during upload'))
        xhr.send(form)
      }
      send()
    })
  },
}

/* -------------------------------------------------------------- system ---- */

export const systemApi = {
  health: () => apiRequest<import('./types').HealthResponse>('/health'),
  activePolicy: () => apiRequest<import('./types').ActivePolicy>('/policies/active'),
}

export { BASE as API_BASE }
