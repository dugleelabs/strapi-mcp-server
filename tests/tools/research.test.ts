import { describe, expect, it, vi } from 'vitest'
import { ErrorCode } from '../../src/lib/errors.js'
import type { SearchProvider } from '../../src/providers/search/index.js'
import { createResearchTool } from '../../src/tools/research.js'

const mockResults = [
  { title: 'Result', url: 'https://example.com', content: 'Content', score: 0.9 },
]

const mockProvider: SearchProvider = {
  name: 'tavily',
  search: vi.fn().mockResolvedValue(mockResults),
}

const capabilitiesEnabled = { crud: true as const, search: true, ai: false }
const capabilitiesDisabled = { crud: true as const, search: false, ai: false }

describe('research_topic', () => {
  it('returns query, results, and provider on success', async () => {
    const tool = createResearchTool(mockProvider, capabilitiesEnabled)
    const result = await tool({ topic: 'AI trends', maxResults: 10 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.query).toBe('AI trends')
      expect(result.data.results).toHaveLength(1)
      expect(result.data.provider).toBe('tavily')
    }
  })

  it('includes context in query when provided', async () => {
    const tool = createResearchTool(mockProvider, capabilitiesEnabled)
    const result = await tool({ topic: 'AI', context: '2026 trends', maxResults: 10 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.query).toBe('AI 2026 trends')
    }
  })

  it('returns SearchFailed when provider throws', async () => {
    const failingProvider: SearchProvider = {
      name: 'tavily',
      search: vi.fn().mockRejectedValue(new Error('Network error')),
    }
    const tool = createResearchTool(failingProvider, capabilitiesEnabled)
    const result = await tool({ topic: 'test', maxResults: 10 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.SearchFailed)
    }
  })

  it('returns CapabilityDisabled when search=false', async () => {
    const tool = createResearchTool(mockProvider, capabilitiesDisabled)
    const result = await tool({ topic: 'test', maxResults: 10 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe(ErrorCode.CapabilityDisabled)
    }
  })

  it('maxResults is capped at 20 by schema validation', async () => {
    // The Zod schema enforces max: 20 — values over 20 should fail parse
    const { ResearchTopicInputSchema } = await import('../../src/tools/research.js')
    const result = ResearchTopicInputSchema.safeParse({ topic: 'test', maxResults: 25 })
    expect(result.success).toBe(false)
  })
})
