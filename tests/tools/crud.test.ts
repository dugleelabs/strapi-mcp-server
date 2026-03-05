import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server, STRAPI_URL } from '../setup.js'
import { StrapiClient } from '../../src/strapi/client.js'
import { createCrudTools } from '../../src/tools/crud.js'
import { ErrorCode } from '../../src/lib/errors.js'

const client = new StrapiClient(STRAPI_URL, 'test-token')
const tools = createCrudTools(client, STRAPI_URL)

describe('list_entries', () => {
  it('returns entries with correct shape', async () => {
    const result = await tools.listEntries({ contentType: 'articles', page: 1, pageSize: 25, status: 'all' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.entries).toHaveLength(1)
      expect(result.data.total).toBe(1)
    }
  })

  it('returns InvalidArgument for bad contentType', async () => {
    const result = await tools.listEntries({ contentType: 'My Content Type!', page: 1, pageSize: 25, status: 'all' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.InvalidArgument)
    }
  })

  it('propagates Strapi errors as ToolResult failure', async () => {
    server.use(
      http.get(`${STRAPI_URL}/api/articles`, () =>
        HttpResponse.json({ error: { status: 401, name: 'UnauthorizedError', message: 'Unauthorized' } }, { status: 401 }),
      ),
    )
    const result = await tools.listEntries({ contentType: 'articles', page: 1, pageSize: 25, status: 'all' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.StrapiUnauthorised)
    }
  })
})

describe('get_entry', () => {
  it('returns entry on success', async () => {
    const result = await tools.getEntry({ contentType: 'articles', id: 1 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.entry.id).toBe(1)
    }
  })

  it('returns StrapiNotFound for missing entry', async () => {
    server.use(
      http.get(`${STRAPI_URL}/api/articles/999`, () =>
        HttpResponse.json({ error: { status: 404, name: 'NotFoundError', message: 'Not found' } }, { status: 404 }),
      ),
    )
    const result = await tools.getEntry({ contentType: 'articles', id: 999 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.StrapiNotFound)
    }
  })
})

describe('create_entry', () => {
  it('returns id, adminUrl, and entry on success', async () => {
    const result = await tools.createEntry({ contentType: 'articles', data: { title: 'Test' }, publish: false })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(42)
      expect(result.data.adminUrl).toContain('42')
    }
  })

  it('sends publishedAt in request body when publish=true', async () => {
    let capturedBody: Record<string, unknown> | undefined
    server.use(
      http.post(`${STRAPI_URL}/api/articles`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ data: { id: 43, attributes: {} }, meta: {} })
      }),
    )
    await tools.createEntry({ contentType: 'articles', data: { title: 'Published' }, publish: true })
    expect((capturedBody?.['data'] as Record<string, unknown>)?.['publishedAt']).toBeTruthy()
  })
})

describe('update_entry', () => {
  it('returns updated entry', async () => {
    const result = await tools.updateEntry({ contentType: 'articles', id: 1, data: { title: 'Updated' } })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe(1)
    }
  })
})

describe('delete_entry', () => {
  it('returns success message', async () => {
    const result = await tools.deleteEntry({ contentType: 'articles', id: 1 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message).toContain('1')
      expect(result.data.message).toContain('articles')
    }
  })
})
