import { ErrorCode, formatError } from '../../lib/errors.js'
import type { SearchProvider, SearchResult } from './index.js'

interface ExaResult {
  title: string
  url: string
  text?: string
  score?: number
}

interface ExaResponse {
  results: ExaResult[]
}

export class ExaSearchProvider implements SearchProvider {
  readonly name = 'exa'

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    let res: Response
    try {
      res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify({
          query,
          numResults: maxResults,
          contents: { text: true },
        }),
      })
    } catch (err) {
      throw formatError(
        ErrorCode.SearchFailed,
        `Exa network error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!res.ok) {
      throw formatError(
        ErrorCode.SearchFailed,
        `Exa returned ${res.status}: ${res.statusText}`,
      )
    }

    const data = (await res.json()) as ExaResponse
    return data.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.text ?? '',
      score: r.score,
    }))
  }
}
