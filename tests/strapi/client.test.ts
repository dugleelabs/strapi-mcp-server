import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server, STRAPI_URL } from '../setup.js'
import { StrapiClient, normaliseContentType } from '../../src/strapi/client.js'
import { ErrorCode } from '../../src/lib/errors.js'

const client = new StrapiClient(STRAPI_URL, 'test-token')

describe('normaliseContentType', () => {
  it('accepts plural form as-is', () => {
    expect(normaliseContentType('articles')).toBe('articles')
  })

  it('pluralises singular form', () => {
    expect(normaliseContentType('article')).toBe('articles')
  })

  it('strips Strapi UID format', () => {
    expect(normaliseContentType('api::article.article')).toBe('articles')
  })

  it('throws InvalidArgument on invalid characters', () => {
    expect(() => normaliseContentType('My Content Type!')).toThrow()
  })
})

describe('StrapiClient.ping', () => {
  it('resolves on 200', async () => {
    await expect(client.ping()).resolves.toBeUndefined()
  })

  it('throws StrapiNetwork on connection failure', async () => {
    server.use(http.get(`${STRAPI_URL}/api`, () => HttpResponse.error()))
    const err = await client.ping().catch((e) => e)
    expect(err.code).toBe(ErrorCode.StrapiNetwork)
  })
})

describe('StrapiClient.listEntries', () => {
  it('returns entries with pagination', async () => {
    const result = await client.listEntries('articles')
    expect(result.entries).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
  })

  it('throws StrapiUnauthorised on 401', async () => {
    server.use(
      http.get(`${STRAPI_URL}/api/articles`, () =>
        HttpResponse.json({ error: { status: 401, name: 'UnauthorizedError', message: 'Unauthorized' } }, { status: 401 }),
      ),
    )
    const err = await client.listEntries('articles').catch((e) => e)
    expect(err.code).toBe(ErrorCode.StrapiUnauthorised)
  })

  it('throws StrapiUnauthorised on 403', async () => {
    server.use(
      http.get(`${STRAPI_URL}/api/articles`, () =>
        HttpResponse.json({ error: { status: 403, name: 'ForbiddenError', message: 'Forbidden' } }, { status: 403 }),
      ),
    )
    const err = await client.listEntries('articles').catch((e) => e)
    expect(err.code).toBe(ErrorCode.StrapiUnauthorised)
  })
})

describe('StrapiClient.getEntry', () => {
  it('returns entry on success', async () => {
    const entry = await client.getEntry('articles', 1)
    expect(entry.id).toBe(1)
  })

  it('throws StrapiNotFound on 404', async () => {
    server.use(
      http.get(`${STRAPI_URL}/api/articles/99`, () =>
        HttpResponse.json({ error: { status: 404, name: 'NotFoundError', message: 'Not found' } }, { status: 404 }),
      ),
    )
    const err = await client.getEntry('articles', 99).catch((e) => e)
    expect(err.code).toBe(ErrorCode.StrapiNotFound)
  })
})

describe('StrapiClient.createEntry', () => {
  it('creates draft entry', async () => {
    const entry = await client.createEntry('articles', { title: 'New Post' })
    expect(entry.id).toBe(42)
  })

  it('includes publishedAt when publish=true', async () => {
    let capturedBody: Record<string, unknown> | undefined
    server.use(
      http.post(`${STRAPI_URL}/api/articles`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ data: { id: 43, attributes: {} }, meta: {} })
      }),
    )
    await client.createEntry('articles', { title: 'Published' }, true)
    expect((capturedBody?.['data'] as Record<string, unknown>)?.['publishedAt']).toBeTruthy()
  })

  it('throws StrapiValidation on 400', async () => {
    server.use(
      http.post(`${STRAPI_URL}/api/articles`, () =>
        HttpResponse.json(
          { error: { status: 400, name: 'ValidationError', message: 'title is required' } },
          { status: 400 },
        ),
      ),
    )
    const err = await client.createEntry('articles', {}).catch((e) => e)
    expect(err.code).toBe(ErrorCode.StrapiValidation)
  })
})

describe('StrapiClient.updateEntry', () => {
  it('returns updated entry', async () => {
    const entry = await client.updateEntry('articles', 1, { title: 'Updated' })
    expect(entry.id).toBe(1)
  })

  it('throws StrapiNotFound when entry missing', async () => {
    server.use(
      http.put(`${STRAPI_URL}/api/articles/99`, () =>
        HttpResponse.json({ error: { status: 404, name: 'NotFoundError', message: 'Not found' } }, { status: 404 }),
      ),
    )
    const err = await client.updateEntry('articles', 99, {}).catch((e) => e)
    expect(err.code).toBe(ErrorCode.StrapiNotFound)
  })
})

describe('StrapiClient.deleteEntry', () => {
  it('resolves on success', async () => {
    await expect(client.deleteEntry('articles', 1)).resolves.toBeUndefined()
  })

  it('throws StrapiNotFound when entry missing', async () => {
    server.use(
      http.delete(`${STRAPI_URL}/api/articles/99`, () =>
        HttpResponse.json({ error: { status: 404, name: 'NotFoundError', message: 'Not found' } }, { status: 404 }),
      ),
    )
    const err = await client.deleteEntry('articles', 99).catch((e) => e)
    expect(err.code).toBe(ErrorCode.StrapiNotFound)
  })
})

describe('StrapiClient.listContentTypes', () => {
  it('returns content types array', async () => {
    const types = await client.listContentTypes()
    expect(types).toHaveLength(1)
    expect(types[0]?.uid).toBe('api::article.article')
  })

  it('throws StrapiUnauthorised on 403', async () => {
    server.use(
      http.get(`${STRAPI_URL}/api/content-type-builder/content-types`, () =>
        HttpResponse.json({ error: { status: 403, name: 'ForbiddenError', message: 'Forbidden' } }, { status: 403 }),
      ),
    )
    const err = await client.listContentTypes().catch((e) => e)
    expect(err.code).toBe(ErrorCode.StrapiUnauthorised)
  })
})
