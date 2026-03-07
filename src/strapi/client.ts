import { ErrorCode, formatError } from '../lib/errors.js'
import type {
  StrapiContentType,
  StrapiContentTypeListResponse,
  StrapiEntry,
  StrapiErrorResponse,
  StrapiListResponse,
  StrapiSingleResponse,
} from './types.js'

export interface ListParams {
  page?: number
  pageSize?: number
  status?: 'draft' | 'published' | 'all'
  filters?: Record<string, unknown>
}

export interface ListResponse {
  entries: Array<StrapiEntry & { attributes: Record<string, unknown> }>
  total: number
  page: number
  pageCount: number
}

// Accepts "article", "articles", or "api::article.article" — returns plural path segment
export function normaliseContentType(input: string): string {
  let name = input.trim()

  // Strip Strapi UID format: "api::article.article" → "article"
  if (name.includes('::')) {
    const parts = name.split('.')
    name = parts[parts.length - 1] ?? name
  }

  // Pluralise if not already plural (simple heuristic: add 's' if no trailing 's')
  if (!name.endsWith('s')) {
    name = `${name}s`
  }

  name = name.toLowerCase()

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw formatError(
      ErrorCode.InvalidArgument,
      `Invalid content type name "${input}". Must contain only lowercase letters, numbers, and hyphens.`,
    )
  }

  return name
}

export class StrapiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 10_000,
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })

      if (!res.ok) {
        let errorBody: StrapiErrorResponse | undefined
        try {
          errorBody = (await res.json()) as StrapiErrorResponse
        } catch {
          // ignore parse failure
        }
        const message = errorBody?.error?.message ?? res.statusText

        if (res.status === 401 || res.status === 403) {
          throw formatError(
            ErrorCode.StrapiUnauthorised,
            `Strapi returned ${res.status}. Check your API token has the required permissions. ${message}`,
          )
        }
        if (res.status === 404) {
          throw formatError(ErrorCode.StrapiNotFound, `Not found: ${message}`)
        }
        if (res.status === 400) {
          throw formatError(
            ErrorCode.StrapiValidation,
            `Strapi validation error: ${message}`,
            errorBody?.error?.details,
          )
        }
        throw formatError(
          ErrorCode.StrapiNetwork,
          `Strapi request failed with status ${res.status}: ${message}`,
        )
      }

      return res.json() as Promise<T>
    } catch (err) {
      if ((err as { success?: boolean }).success === false) throw err
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
      if (isAbort) {
        throw formatError(
          ErrorCode.StrapiNetwork,
          `Request to Strapi timed out after ${timeoutMs}ms. Is Strapi running at ${this.baseUrl}?`,
        )
      }
      throw formatError(
        ErrorCode.StrapiNetwork,
        `Cannot connect to Strapi at ${this.baseUrl}. Is it running? ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  async ping(): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      await fetch(`${this.baseUrl}/api`, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.token}` },
      })
    } catch (err) {
      const isAbort =
        err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
      throw formatError(
        ErrorCode.StrapiNetwork,
        isAbort
          ? `Strapi did not respond within 10s. Is it running at ${this.baseUrl}?`
          : `Cannot connect to Strapi at ${this.baseUrl}. Is it running? ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  async listEntries(contentType: string, params: ListParams = {}): Promise<ListResponse> {
    const ct = normaliseContentType(contentType)
    const qs = new URLSearchParams()

    qs.set('pagination[page]', String(params.page ?? 1))
    qs.set('pagination[pageSize]', String(params.pageSize ?? 25))
    qs.set('publicationState', 'preview')

    if (params.status === 'draft') {
      qs.set('filters[publishedAt][$null]', 'true')
    } else if (params.status === 'published') {
      qs.set('filters[publishedAt][$notNull]', 'true')
    }

    if (params.filters) {
      for (const [key, value] of Object.entries(params.filters)) {
        if (typeof value === 'object' && value !== null) {
          for (const [op, opVal] of Object.entries(value as Record<string, unknown>)) {
            qs.set(`filters[${key}][${op}]`, String(opVal))
          }
        } else {
          qs.set(`filters[${key}]`, String(value))
        }
      }
    }

    const res = await this.request<StrapiListResponse>('GET', `/api/${ct}?${qs}`)
    return {
      entries: res.data,
      total: res.meta.pagination.total,
      page: res.meta.pagination.page,
      pageCount: res.meta.pagination.pageCount,
    }
  }

  async getEntry(contentType: string, id: number): Promise<StrapiEntry> {
    const ct = normaliseContentType(contentType)
    const res = await this.request<StrapiSingleResponse>(
      'GET',
      `/api/${ct}/${id}?publicationState=preview`,
    )
    return res.data
  }

  async createEntry(
    contentType: string,
    data: Record<string, unknown>,
    publish = false,
  ): Promise<StrapiEntry> {
    const ct = normaliseContentType(contentType)
    const body: Record<string, unknown> = { data }
    if (publish) {
      body.data = { ...data, publishedAt: new Date().toISOString() }
    }
    const res = await this.request<StrapiSingleResponse>('POST', `/api/${ct}`, body)
    return res.data
  }

  async updateEntry(
    contentType: string,
    id: number,
    data: Record<string, unknown>,
  ): Promise<StrapiEntry> {
    const ct = normaliseContentType(contentType)
    const res = await this.request<StrapiSingleResponse>('PUT', `/api/${ct}/${id}`, { data })
    return res.data
  }

  async deleteEntry(contentType: string, id: number): Promise<void> {
    const ct = normaliseContentType(contentType)
    await this.request<unknown>('DELETE', `/api/${ct}/${id}`)
  }

  async listContentTypes(): Promise<StrapiContentType[]> {
    const res = await this.request<StrapiContentTypeListResponse>(
      'GET',
      '/api/content-type-builder/content-types',
    )
    return res.data
  }

  async getContentTypeSchema(uid: string): Promise<StrapiContentType> {
    const res = await this.request<{ data: StrapiContentType }>(
      'GET',
      `/api/content-type-builder/content-types/${uid}`,
    )
    return res.data
  }
}
