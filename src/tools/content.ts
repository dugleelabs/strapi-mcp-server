import { generateObject } from 'ai'
import type { LanguageModel } from 'ai'
import { z } from 'zod'
import { ErrorCode, formatError, type ToolResult } from '../lib/errors.js'
import { log } from '../lib/logger.js'
import type { StrapiClient } from '../strapi/client.js'
import type { SearchProvider } from '../providers/search/index.js'
import type { Capabilities } from '../config.js'

// ── Schemas ──────────────────────────────────────────────────────────────────

const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number().optional(),
})

export const GenerateDraftInputSchema = z.object({
  topic: z.string().describe('Topic to write about'),
  context: z.string().optional().describe('Background context on the topic'),
  researchResults: z
    .array(SearchResultSchema)
    .optional()
    .describe('Research results from research_topic to use as source material'),
  styleGuide: z.string().optional().describe('Editorial voice instructions'),
  targetWordCount: z
    .number()
    .int()
    .min(400)
    .max(2000)
    .default(800)
    .describe('Target word count for the body (default: 800, range: 400-2000)'),
})

export const CreateContentFromResearchInputSchema = z.object({
  topic: z.string().describe('Topic to research and write about'),
  contentType: z.string().describe('Strapi content type to create the entry in'),
  context: z.string().optional().describe('Additional context to refine the research'),
  styleGuide: z.string().optional().describe('Editorial voice instructions'),
  fieldMapping: z
    .record(z.string())
    .optional()
    .describe(
      'Maps draft output fields to your Strapi field names. ' +
        'If omitted, draft keys are used as-is (title, body, metaDescription, tags). ' +
        'Example: { "title": "headline", "body": "content", "tags": "categories" }',
    ),
})

const DraftOutputSchema = z.object({
  title: z.string().describe('Blog post title'),
  body: z.string().describe('Full post in Markdown'),
  metaDescription: z.string().describe('SEO meta description (under 160 characters)'),
  tags: z.array(z.string()).describe('Suggested tags'),
})

type GenerateDraftInput = z.infer<typeof GenerateDraftInputSchema>
type CreateContentFromResearchInput = z.infer<typeof CreateContentFromResearchInputSchema>

export interface DraftOutput {
  title: string
  body: string
  metaDescription: string
  tags: string[]
  wordCount: number
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export function createContentTools(
  model: LanguageModel,
  strapiClient: StrapiClient,
  searchProvider: SearchProvider | undefined,
  strapiUrl: string,
  capabilities: Capabilities,
) {
  async function generateDraft(
    input: GenerateDraftInput,
  ): Promise<ToolResult<DraftOutput>> {
    log.tool('generate_draft', { topic: input.topic, targetWordCount: input.targetWordCount })

    if (!capabilities.ai) {
      return formatError(
        ErrorCode.CapabilityDisabled,
        '`generate_draft` is disabled — set AI_PROVIDER and AI_MODEL to enable it.',
      )
    }

    const researchSection =
      input.researchResults && input.researchResults.length > 0
        ? `\n\nUse the following research as your primary source material:\n\n${input.researchResults
            .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
            .join('\n\n')}`
        : ''

    const styleSection = input.styleGuide
      ? `\n\nEditorial style guide: ${input.styleGuide}`
      : ''

    const contextSection = input.context ? `\n\nAdditional context: ${input.context}` : ''

    const systemPrompt = [
      'You are a skilled technical writer producing developer-focused blog content.',
      `Write a blog post of approximately ${input.targetWordCount} words.`,
      'The body must be in Markdown. The meta description must be under 160 characters.',
      'Write with authority and clarity. Avoid marketing fluff.',
      styleSection,
    ]
      .filter(Boolean)
      .join(' ')

    const userPrompt = `Write a blog post about: ${input.topic}${contextSection}${researchSection}`

    try {
      const { object } = await generateObject({
        model,
        schema: DraftOutputSchema,
        system: systemPrompt,
        prompt: userPrompt,
      })

      return {
        success: true,
        data: {
          ...object,
          wordCount: object.body.split(/\s+/).filter(Boolean).length,
        },
      }
    } catch (err) {
      if ((err as { success?: boolean }).success === false) {
        return err as Extract<ToolResult<DraftOutput>, { success: false }>
      }
      return formatError(
        ErrorCode.AIFailed,
        `AI generation failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async function createContentFromResearch(
    input: CreateContentFromResearchInput,
  ): Promise<ToolResult<{ strapiId: number; adminUrl: string; title: string; wordCount: number; step: string }>> {
    log.tool('create_content_from_research', { topic: input.topic, contentType: input.contentType })

    if (!capabilities.search || !capabilities.ai) {
      return formatError(
        ErrorCode.CapabilityDisabled,
        '`create_content_from_research` requires both search and AI capabilities. ' +
          'Set SEARCH_PROVIDER + key and AI_PROVIDER + AI_MODEL + key.',
      )
    }

    if (!searchProvider) {
      return formatError(ErrorCode.CapabilityDisabled, 'Search provider not initialised.')
    }

    // Step 1: Research
    const query = input.context ? `${input.topic} ${input.context}` : input.topic
    let researchResults: Array<{ title: string; url: string; content: string; score?: number }>
    try {
      researchResults = await searchProvider.search(query, 10)
    } catch (err) {
      return {
        success: false,
        code: ErrorCode.SearchFailed,
        error: `Research step failed: ${err instanceof Error ? err.message : String(err)}`,
        details: { step: 'research' },
      }
    }

    // Step 2: Generate draft
    const draftResult = await generateDraft({
      topic: input.topic,
      context: input.context,
      researchResults,
      styleGuide: input.styleGuide,
      targetWordCount: 800,
    })

    if (!draftResult.success) {
      return {
        success: false,
        code: draftResult.code,
        error: draftResult.error,
        details: { step: 'generate', original: draftResult.details },
      }
    }

    const draft = draftResult.data

    // Step 3: Map fields and create Strapi entry
    const mapping = input.fieldMapping ?? {}
    const strapiData: Record<string, unknown> = {
      [mapping['title'] ?? 'title']: draft.title,
      [mapping['body'] ?? 'body']: draft.body,
      [mapping['metaDescription'] ?? 'metaDescription']: draft.metaDescription,
      [mapping['tags'] ?? 'tags']: draft.tags,
    }

    try {
      const entry = await strapiClient.createEntry(input.contentType, strapiData, false)
      const ct = input.contentType.toLowerCase().replace(/[^a-z0-9-]/g, '')
      const adminUrl = `${strapiUrl}/admin/content-manager/collection-types/api::${ct}.${ct}/${entry.id}`
      return {
        success: true,
        data: {
          strapiId: entry.id,
          adminUrl,
          title: draft.title,
          wordCount: draft.wordCount,
          step: 'complete',
        },
      }
    } catch (err) {
      return {
        success: false,
        code: ErrorCode.StrapiNetwork,
        error: `Save to Strapi failed: ${err instanceof Error ? err.message : String(err)}`,
        details: { step: 'save' },
      }
    }
  }

  return { generateDraft, createContentFromResearch }
}
