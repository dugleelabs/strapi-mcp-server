import { ErrorCode, formatError } from '../../lib/errors.js'
import type { SearchProvider, SearchResult } from './index.js'

interface BraveWebResult {
  title: string
  url: string
  description: string
}

interface BraveResponse {
  web?: { results: BraveWebResult[] }
}

export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave'

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const qs = new URLSearchParams({ q: query, count: String(maxResults) })
    let res: Response
    try {
      res = await fetch(`https://api.search.brave.com/res/v1/web/search?${qs}`, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey,
        },
      })
    } catch (err) {
      throw formatError(
        ErrorCode.SearchFailed,
        `Brave Search network error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!res.ok) {
      throw formatError(
        ErrorCode.SearchFailed,
        `Brave Search returned ${res.status}: ${res.statusText}`,
      )
    }

    const data = (await res.json()) as BraveResponse
    return (data.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.description,
    }))
  }
}
