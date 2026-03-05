import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { generateObject } from 'ai'
import { server, STRAPI_URL } from '../setup.js'
import { StrapiClient } from '../../src/strapi/client.js'
import { createContentTools } from '../../src/tools/content.js'
import { ErrorCode } from '../../src/lib/errors.js'
import type { LanguageModel } from 'ai'
import type { SearchProvider } from '../../src/providers/search/index.js'

// Mock the AI SDK generateObject
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      title: 'Test Title',
      body: 'Test body content with many words to count them properly here and there.',
      metaDescription: 'Test meta description under 160 chars.',
      tags: ['tag1', 'tag2'],
    },
  }),
}))

const mockModel = {} as LanguageModel
const client = new StrapiClient(STRAPI_URL, 'test-token')

const mockSearchProvider: SearchProvider = {
  name: 'tavily',
  search: vi.fn().mockResolvedValue([
    { title: 'Research Result', url: 'https://example.com', content: 'Research content' },
  ]),
}

const capabilitiesWithBoth = { crud: true as const, search: true, ai: true }
const capabilitiesAiOnly = { crud: true as const, search: false, ai: true }
const capabilitiesNone = { crud: true as const, search: false, ai: false }

describe('generate_draft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns correct shape with wordCount', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { title: 'Test Title', body: 'Test body content.', metaDescription: 'Meta.', tags: ['tag1'] },
    } as never)
    const tools = createContentTools(mockModel, client, undefined, STRAPI_URL, capabilitiesAiOnly)
    const result = await tools.generateDraft({ topic: 'TypeScript', targetWordCount: 800 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Test Title')
      expect(result.data.wordCount).toBeGreaterThan(0)
    }
  })

  it('includes styleGuide in prompt when provided', async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: { title: 'T', body: 'B', metaDescription: 'M', tags: [] },
    } as never)
    const tools = createContentTools(mockModel, client, undefined, STRAPI_URL, capabilitiesAiOnly)
    await tools.generateDraft({ topic: 'AI', styleGuide: 'Write tersely.', targetWordCount: 800 })
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ system: expect.stringContaining('Write tersely.') }),
    )
  })

  it('returns CapabilityDisabled when ai=false', async () => {
    const tools = createContentTools(mockModel, client, undefined, STRAPI_URL, capabilitiesNone)
    const result = await tools.generateDraft({ topic: 'test', targetWordCount: 800 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.CapabilityDisabled)
    }
  })
})

describe('create_content_from_research', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: 'Research Title', body: 'Body content.', metaDescription: 'Meta.', tags: ['tag'] },
    } as never)
  })

  it('returns complete result on all steps succeeding', async () => {
    const tools = createContentTools(mockModel, client, mockSearchProvider, STRAPI_URL, capabilitiesWithBoth)
    const result = await tools.createContentFromResearch({ topic: 'AI trends', contentType: 'articles' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.step).toBe('complete')
      expect(result.data.strapiId).toBe(42)
      expect(result.data.adminUrl).toContain('42')
    }
  })

  it('returns research error when search fails', async () => {
    const failingSearch: SearchProvider = {
      name: 'tavily',
      search: vi.fn().mockRejectedValue(new Error('Search failed')),
    }
    const tools = createContentTools(mockModel, client, failingSearch, STRAPI_URL, capabilitiesWithBoth)
    const result = await tools.createContentFromResearch({ topic: 'test', contentType: 'articles' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.SearchFailed)
      expect((result.details as { step: string })?.step).toBe('research')
    }
  })

  it('returns generate error when AI fails, no Strapi call made', async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error('AI error'))
    const strapiCreateSpy = vi.spyOn(client, 'createEntry')
    const tools = createContentTools(mockModel, client, mockSearchProvider, STRAPI_URL, capabilitiesWithBoth)
    const result = await tools.createContentFromResearch({ topic: 'test', contentType: 'articles' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect((result.details as { step: string })?.step).toBe('generate')
    }
    expect(strapiCreateSpy).not.toHaveBeenCalled()
  })

  it('returns save error when Strapi create fails', async () => {
    server.use(
      http.post(`${STRAPI_URL}/api/articles`, () =>
        HttpResponse.json(
          { error: { status: 400, name: 'ValidationError', message: 'Bad' } },
          { status: 400 },
        ),
      ),
    )
    const tools = createContentTools(mockModel, client, mockSearchProvider, STRAPI_URL, capabilitiesWithBoth)
    const result = await tools.createContentFromResearch({ topic: 'test', contentType: 'articles' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect((result.details as { step: string })?.step).toBe('save')
    }
  })

  it('respects custom fieldMapping', async () => {
    let capturedBody: Record<string, unknown> | undefined
    server.use(
      http.post(`${STRAPI_URL}/api/articles`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ data: { id: 99, attributes: {} }, meta: {} })
      }),
    )
    const tools = createContentTools(mockModel, client, mockSearchProvider, STRAPI_URL, capabilitiesWithBoth)
    await tools.createContentFromResearch({
      topic: 'test',
      contentType: 'articles',
      fieldMapping: { title: 'headline', body: 'content' },
    })
    const data = capturedBody?.['data'] as Record<string, unknown>
    expect(data).toHaveProperty('headline')
    expect(data).toHaveProperty('content')
    expect(data).not.toHaveProperty('title')
  })

  it('returns CapabilityDisabled when missing search or ai', async () => {
    const tools = createContentTools(mockModel, client, undefined, STRAPI_URL, capabilitiesAiOnly)
    const result = await tools.createContentFromResearch({ topic: 'test', contentType: 'articles' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.CapabilityDisabled)
    }
  })
})
