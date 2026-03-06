import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { ErrorCode } from '../../src/lib/errors.js'
import { BraveSearchProvider } from '../../src/providers/search/brave.js'
import { ExaSearchProvider } from '../../src/providers/search/exa.js'
import { createSearchProvider } from '../../src/providers/search/index.js'
import { TavilySearchProvider } from '../../src/providers/search/tavily.js'
import { server } from '../setup.js'

describe('TavilySearchProvider', () => {
  const provider = new TavilySearchProvider('test-key')

  it('maps response correctly', async () => {
    server.use(
      http.post('https://api.tavily.com/search', () =>
        HttpResponse.json({
          results: [
            { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1', score: 0.9 },
            { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2', score: 0.8 },
          ],
        }),
      ),
    )
    const results = await provider.search('test query', 5)
    expect(results).toHaveLength(2)
    expect(results[0]?.title).toBe('Result 1')
    expect(results[0]?.url).toBe('https://example.com/1')
    expect(results[0]?.score).toBe(0.9)
  })

  it('throws SearchFailed on 401', async () => {
    server.use(
      http.post('https://api.tavily.com/search', () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )
    const err = await provider.search('query', 5).catch((e) => e)
    expect(err.code).toBe(ErrorCode.SearchFailed)
  })
})

describe('BraveSearchProvider', () => {
  const provider = new BraveSearchProvider('test-key')

  it('maps response correctly', async () => {
    server.use(
      http.get('https://api.search.brave.com/res/v1/web/search', () =>
        HttpResponse.json({
          web: {
            results: [
              { title: 'Brave Result', url: 'https://brave.com/1', description: 'Brave desc' },
            ],
          },
        }),
      ),
    )
    const results = await provider.search('test', 5)
    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('Brave Result')
    expect(results[0]?.content).toBe('Brave desc')
  })

  it('returns empty array for empty results', async () => {
    server.use(
      http.get('https://api.search.brave.com/res/v1/web/search', () =>
        HttpResponse.json({ web: { results: [] } }),
      ),
    )
    const results = await provider.search('no results', 5)
    expect(results).toHaveLength(0)
  })
})

describe('ExaSearchProvider', () => {
  const provider = new ExaSearchProvider('test-key')

  it('maps response correctly', async () => {
    server.use(
      http.post('https://api.exa.ai/search', () =>
        HttpResponse.json({
          results: [
            { title: 'Exa Result', url: 'https://exa.ai/1', text: 'Exa content', score: 0.95 },
          ],
        }),
      ),
    )
    const results = await provider.search('test', 5)
    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('Exa Result')
  })
})

describe('createSearchProvider factory', () => {
  it('throws on unknown provider', () => {
    expect(() => createSearchProvider({ provider: 'unknown' as 'tavily', apiKey: 'key' })).toThrow()
  })

  it('returns TavilySearchProvider for tavily', () => {
    const p = createSearchProvider({ provider: 'tavily', apiKey: 'key' })
    expect(p.name).toBe('tavily')
  })
})
