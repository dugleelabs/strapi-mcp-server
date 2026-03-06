import { z } from 'zod'
import type { Capabilities } from '../config.js'
import { ErrorCode, type ToolResult, formatError } from '../lib/errors.js'
import { log } from '../lib/logger.js'
import type { SearchProvider, SearchResult } from '../providers/search/index.js'

export const ResearchTopicInputSchema = z.object({
  topic: z.string().describe('Topic or query to research'),
  context: z.string().optional().describe('Additional context to refine the search'),
  maxResults: z
    .number()
    .int()
    .positive()
    .max(20)
    .default(10)
    .describe('Number of results to return (default: 10, max: 20)'),
})

export type ResearchTopicInput = z.infer<typeof ResearchTopicInputSchema>

export interface ResearchTopicOutput {
  query: string
  results: SearchResult[]
  provider: string
}

export function createResearchTool(
  searchProvider: SearchProvider,
  capabilities: Capabilities,
): (input: ResearchTopicInput) => Promise<ToolResult<ResearchTopicOutput>> {
  return async (input) => {
    log.tool('research_topic', input)

    if (!capabilities.search) {
      return formatError(
        ErrorCode.CapabilityDisabled,
        '`research_topic` is disabled — set SEARCH_PROVIDER and the corresponding API key to enable it. ' +
          'Supported providers: tavily (TAVILY_API_KEY), brave (BRAVE_API_KEY), exa (EXA_API_KEY).',
      )
    }

    const query = input.context ? `${input.topic} ${input.context}` : input.topic

    try {
      const results = await searchProvider.search(query, input.maxResults)
      return { success: true, data: { query, results, provider: searchProvider.name } }
    } catch (err) {
      if ((err as { success?: boolean }).success === false) {
        return err as Extract<ToolResult<ResearchTopicOutput>, { success: false }>
      }
      return formatError(
        ErrorCode.SearchFailed,
        `Search failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
