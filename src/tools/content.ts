import { generateObject } from 'ai'
import type { LanguageModel } from 'ai'
import { z } from 'zod'
import type { Capabilities } from '../config.js'
import { ErrorCode, type ToolResult, formatError } from '../lib/errors.js'
import { log } from '../lib/logger.js'
import type { SearchProvider } from '../providers/search/index.js'
import type { StrapiClient } from '../strapi/client.js'

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
  imageUrls: z
    .array(z.string())
    .optional()
    .describe(
      'Image URLs to embed inline in the article body. The first URL is used as the cover image suggestion. Remaining URLs are placed between sections as illustrations.',
    ),
  keywords: z
    .string()
    .optional()
    .describe(
      'Comma-separated SEO keyword strategy: primary keyword first, then secondary, long-tail, and LSI terms. The primary keyword must appear in the title, first paragraph, and at least one H2.',
    ),
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
  seoTitle: z.string().describe('SEO page title, optimised for search (50–60 characters)'),
  keywords: z.string().describe('Comma-separated SEO keywords relevant to the topic'),
  socialTitle: z.string().describe('Social media sharing title (under 70 characters)'),
  socialDescription: z.string().describe('Social media sharing description (under 200 characters)'),
  tags: z.array(z.string()).describe('Suggested tags'),
})

type GenerateDraftInput = z.infer<typeof GenerateDraftInputSchema>
type CreateContentFromResearchInput = z.infer<typeof CreateContentFromResearchInputSchema>

export interface DraftOutput {
  title: string
  body: string
  metaDescription: string
  seoTitle: string
  keywords: string
  socialTitle: string
  socialDescription: string
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
  async function generateDraft(input: GenerateDraftInput): Promise<ToolResult<DraftOutput>> {
    log.tool('generate_draft', { topic: input.topic, targetWordCount: input.targetWordCount })

    if (!capabilities.ai) {
      return formatError(
        ErrorCode.CapabilityDisabled,
        '`generate_draft` is disabled — set AI_PROVIDER and AI_MODEL to enable it.',
      )
    }

    const researchSection =
      input.researchResults && input.researchResults.length > 0
        ? `\n\nResearch sources — use these as primary material and cite them as inline Markdown links and in a References section at the bottom:\n\n${input.researchResults
            .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
            .join('\n\n')}`
        : ''

    const keywordsSection = input.keywords
      ? `\n\nSEO keyword strategy (primary keyword is first — embed it in the title, opening paragraph, and at least one H2; distribute secondary and LSI terms naturally throughout): ${input.keywords}`
      : ''

    const imagesSection =
      input.imageUrls && input.imageUrls.length > 0
        ? `\n\nInline images — embed these in the body using Markdown image syntax at natural section breaks:\n${input.imageUrls.map((url, i) => `Image ${i + 1}: ${url}`).join('\n')}`
        : ''

    const contextSection = input.context ? `\n\nAdditional context: ${input.context}` : ''

    const systemPrompt = [
      'You are an expert content writer and SEO strategist writing for dugleelabs.io — a blog that publishes opinionated takes on technology, software craft, and the developer experience.',
      `Write a blog post of approximately ${input.targetWordCount} words.`,
      'The body must be in Markdown.',

      'VOICE: Write as a personal viewpoint, critique, or practical guide — not a neutral summary. Take a clear stance. Use "we" and "our" to reflect the dugleelabs perspective. Be direct and opinionated.',

      'STRUCTURE: Open with a hook that states the point of view immediately. Use H2/H3 headings. Place inline images between sections using Markdown image syntax (![descriptive alt text](url)). End with a "## Join the Conversation" section that poses 1–2 open questions and invites readers to engage, with a mention of dugleelabs.io linking to https://dugleelabs.io.',

      'REFERENCES: Cite sources as inline Markdown links where facts or quotes are used. Add a "## References" section at the bottom with numbered backlinks to all sources. Where relevant, link back to https://dugleelabs.io.',

      'SEO: The primary keyword must appear in the title, within the first 100 words, and in at least one H2. Secondary and LSI keywords should be distributed naturally — never stuffed. Target 1–2% keyword density for the primary keyword.',

      'SEO FIELDS: Populate seoTitle (50–60 chars, primary keyword first), metaDescription (under 160 chars, includes primary keyword and a soft CTA), keywords (comma-separated ordered by importance), socialTitle (under 70 chars, engaging and shareable), socialDescription (under 200 chars, hook-driven).',

      input.styleGuide ? `STYLE GUIDE: ${input.styleGuide}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const userPrompt = `Write a blog post about: ${input.topic}${contextSection}${keywordsSection}${imagesSection}${researchSection}`

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

  async function createContentFromResearch(input: CreateContentFromResearchInput): Promise<
    ToolResult<{
      strapiId: number
      adminUrl: string
      title: string
      wordCount: number
      step: string
    }>
  > {
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
      if ((err as { success?: boolean }).success === false) {
        return {
          ...(err as Extract<ToolResult<never>, { success: false }>),
          details: { step: 'research' },
        }
      }
      return formatError(
        ErrorCode.SearchFailed,
        `Research step failed: ${err instanceof Error ? err.message : String(err)}`,
        { step: 'research' },
      )
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
      [mapping.title ?? 'title']: draft.title,
      [mapping.body ?? 'body']: draft.body,
      [mapping.metaDescription ?? 'metaDescription']: draft.metaDescription,
      [mapping.tags ?? 'tags']: draft.tags,
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
