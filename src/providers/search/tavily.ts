import { ErrorCode, formatError } from '../../lib/errors.js'
import type { SearchProvider, SearchResult } from './index.js'

interface TavilyResult {
  title: string
  url: string
  content: string
  score?: number
}

interface TavilyResponse {
  results: TavilyResult[]
}

export class TavilySearchProvider implements SearchProvider {
  readonly name = 'tavily'

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    let res: Response
    try {
      res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: maxResults,
          search_depth: 'advanced',
        }),
      })
    } catch (err) {
      throw formatError(
        ErrorCode.SearchFailed,
        `Tavily network error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!res.ok) {
      throw formatError(
        ErrorCode.SearchFailed,
        `Tavily returned ${res.status}: ${res.statusText}`,
      )
    }

    const data = (await res.json()) as TavilyResponse
    return data.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    }))
  }
}
