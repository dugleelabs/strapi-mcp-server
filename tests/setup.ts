import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import type { StrapiContentType, StrapiEntry } from '../src/strapi/types.js'

// ── Shared fixtures ───────────────────────────────────────────────────────────

export const sampleEntry: StrapiEntry = {
  id: 1,
  attributes: {
    title: 'Test Article',
    content: 'Test content body',
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
}

export const sampleContentType: StrapiContentType = {
  uid: 'api::article.article',
  apiID: 'article',
  schema: {
    displayName: 'Article',
    singularName: 'article',
    pluralName: 'articles',
    kind: 'collectionType',
    attributes: {
      title: { type: 'string', required: true },
      content: { type: 'richtext' },
      publishedAt: { type: 'datetime' },
      createdAt: { type: 'datetime' },
      updatedAt: { type: 'datetime' },
    },
  },
}

export const STRAPI_URL = 'http://localhost:1337'

// ── MSW handlers ─────────────────────────────────────────────────────────────

export const handlers = [
  // Ping
  http.get(`${STRAPI_URL}/api`, () => HttpResponse.json({ data: {} })),

  // List entries
  http.get(`${STRAPI_URL}/api/articles`, () =>
    HttpResponse.json({
      data: [sampleEntry],
      meta: { pagination: { page: 1, pageSize: 25, pageCount: 1, total: 1 } },
    }),
  ),

  // Get entry
  http.get(`${STRAPI_URL}/api/articles/1`, () =>
    HttpResponse.json({ data: sampleEntry, meta: {} }),
  ),

  // Create entry
  http.post(`${STRAPI_URL}/api/articles`, () =>
    HttpResponse.json({ data: { ...sampleEntry, id: 42 }, meta: {} }),
  ),

  // Update entry
  http.put(`${STRAPI_URL}/api/articles/1`, () =>
    HttpResponse.json({ data: sampleEntry, meta: {} }),
  ),

  // Delete entry
  http.delete(`${STRAPI_URL}/api/articles/1`, () =>
    HttpResponse.json({ data: sampleEntry, meta: {} }),
  ),

  // List content types
  http.get(`${STRAPI_URL}/api/content-type-builder/content-types`, () =>
    HttpResponse.json({ data: [sampleContentType] }),
  ),

  // Get content type schema — use wildcard since '::' breaks URLPattern named groups
  http.get(`${STRAPI_URL}/api/content-type-builder/content-types/*`, () =>
    HttpResponse.json({ data: sampleContentType }),
  ),
]

export const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
