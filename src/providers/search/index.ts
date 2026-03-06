import type { Config } from '../../config.js'
import { ErrorCode, formatError } from '../../lib/errors.js'
import { BraveSearchProvider } from './brave.js'
import { ExaSearchProvider } from './exa.js'
import { TavilySearchProvider } from './tavily.js'

export interface SearchResult {
  title: string
  url: string
  content: string
  score?: number
}

export interface SearchProvider {
  readonly name: string
  search(query: string, maxResults: number): Promise<SearchResult[]>
}

export function createSearchProvider(config: NonNullable<Config['search']>): SearchProvider {
  switch (config.provider) {
    case 'tavily':
      return new TavilySearchProvider(config.apiKey)
    case 'brave':
      return new BraveSearchProvider(config.apiKey)
    case 'exa':
      return new ExaSearchProvider(config.apiKey)
    default:
      throw formatError(
        ErrorCode.InvalidArgument,
        `Unknown search provider: "${(config as { provider: string }).provider}". Must be one of: tavily, brave, exa.`,
      )
  }
}
