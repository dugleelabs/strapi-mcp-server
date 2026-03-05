import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server, STRAPI_URL } from '../setup.js'
import { StrapiClient } from '../../src/strapi/client.js'
import { createSchemaTools } from '../../src/tools/schema.js'

const client = new StrapiClient(STRAPI_URL, 'test-token')
const tools = createSchemaTools(client)

describe('list_content_types', () => {
  it('returns only non-plugin types with correct shape', async () => {
    const result = await tools.listContentTypes({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contentTypes).toHaveLength(1)
      const ct = result.data.contentTypes[0]
      expect(ct?.uid).toBe('api::article.article')
      expect(ct?.displayName).toBe('Article')
      expect(ct?.pluralName).toBe('articles')
      expect(ct?.kind).toBe('collectionType')
    }
  })

  it('filters out plugin:: types', async () => {
    server.use(
      http.get(`${STRAPI_URL}/api/content-type-builder/content-types`, () =>
        HttpResponse.json({
          data: [
            {
              uid: 'api::article.article',
              apiID: 'article',
              schema: {
                displayName: 'Article',
                singularName: 'article',
                pluralName: 'articles',
                kind: 'collectionType',
                attributes: {},
              },
            },
            {
              uid: 'plugin::upload.file',
              apiID: 'file',
              schema: {
                displayName: 'File',
                singularName: 'file',
                pluralName: 'files',
                kind: 'collectionType',
                attributes: {},
              },
            },
          ],
        }),
      ),
    )
    const result = await tools.listContentTypes({})
    expect(result.success).toBe(true)
    if (result.success) {
      // plugin:: type should be filtered out
      expect(result.data.contentTypes.every((ct) => ct.uid.startsWith('api::'))).toBe(true)
    }
  })
})

describe('get_content_type_schema', () => {
  it('returns attributes, filters system fields', async () => {
    const result = await tools.getContentTypeSchema({ uid: 'api::article.article' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.uid).toBe('api::article.article')
      expect(result.data.displayName).toBe('Article')
      // System fields should be filtered out
      expect(result.data.attributes).not.toHaveProperty('createdAt')
      expect(result.data.attributes).not.toHaveProperty('updatedAt')
      expect(result.data.attributes).not.toHaveProperty('publishedAt')
      // User fields should be present
      expect(result.data.attributes).toHaveProperty('title')
    }
  })
})
