import { z } from 'zod'
import { type ToolResult, formatError } from '../lib/errors.js'
import { ErrorCode as EC } from '../lib/errors.js'
import { log } from '../lib/logger.js'
import type { StrapiClient } from '../strapi/client.js'

type ToolHandler<TInput, TOutput> = (input: TInput) => Promise<ToolResult<TOutput>>

function wrap<TInput, TOutput>(
  name: string,
  fn: (input: TInput) => Promise<TOutput>,
): ToolHandler<TInput, TOutput> {
  return async (input) => {
    log.tool(name, input)
    try {
      const data = await fn(input)
      return { success: true, data }
    } catch (err) {
      if ((err as { success?: boolean }).success === false) {
        return err as Extract<ToolResult<TOutput>, { success: false }>
      }
      return formatError(
        EC.StrapiNetwork,
        `Unexpected error in ${name}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}

// ── Schemas ──────────────────────────────────────────────────────────────────

export const ListEntriesInputSchema = z.object({
  contentType: z.string().describe('Plural API ID of the content type, e.g. "articles"'),
  page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
  pageSize: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(25)
    .describe('Results per page (default: 25, max: 100)'),
  status: z
    .enum(['draft', 'published', 'all'])
    .default('all')
    .describe('Filter by publication status'),
  filters: z
    .record(z.unknown())
    .optional()
    .describe('Strapi filter object, e.g. { "title": { "$contains": "AI" } }'),
})

export const GetEntryInputSchema = z.object({
  contentType: z.string().describe('Plural API ID of the content type'),
  id: z.number().int().positive().describe('Entry ID'),
})

export const CreateEntryInputSchema = z.object({
  contentType: z.string().describe('Plural API ID of the content type'),
  data: z.record(z.unknown()).describe('Field values — must match the content type schema'),
  publish: z.boolean().default(false).describe('If true, publish immediately (default: draft)'),
})

export const UpdateEntryInputSchema = z.object({
  contentType: z.string().describe('Plural API ID of the content type'),
  id: z.number().int().positive().describe('Entry ID'),
  data: z.record(z.unknown()).describe('Fields to update (partial update)'),
})

export const DeleteEntryInputSchema = z.object({
  contentType: z.string().describe('Plural API ID of the content type'),
  id: z.number().int().positive().describe('Entry ID'),
})

// ── Handlers ─────────────────────────────────────────────────────────────────

export function createCrudTools(client: StrapiClient, strapiUrl: string) {
  const listEntries = wrap(
    'list_entries',
    async (input: z.infer<typeof ListEntriesInputSchema>) => {
      const params: Parameters<typeof client.listEntries>[1] = {
        page: input.page,
        pageSize: input.pageSize,
        status: input.status,
      }
      if (input.filters) params.filters = input.filters as Record<string, unknown>
      const result = await client.listEntries(input.contentType, params)
      return result
    },
  )

  const getEntry = wrap('get_entry', async (input: z.infer<typeof GetEntryInputSchema>) => {
    const entry = await client.getEntry(input.contentType, input.id)
    return { entry }
  })

  const createEntry = wrap(
    'create_entry',
    async (input: z.infer<typeof CreateEntryInputSchema>) => {
      const entry = await client.createEntry(input.contentType, input.data, input.publish)
      const ct = input.contentType.toLowerCase().replace(/[^a-z0-9-]/g, '')
      const adminUrl = `${strapiUrl}/admin/content-manager/collection-types/api::${ct}.${ct}/${entry.id}`
      return { id: entry.id, adminUrl, entry }
    },
  )

  const updateEntry = wrap(
    'update_entry',
    async (input: z.infer<typeof UpdateEntryInputSchema>) => {
      const entry = await client.updateEntry(input.contentType, input.id, input.data)
      return { id: entry.id, entry }
    },
  )

  const deleteEntry = wrap(
    'delete_entry',
    async (input: z.infer<typeof DeleteEntryInputSchema>) => {
      await client.deleteEntry(input.contentType, input.id)
      return {
        success: true as const,
        message: `Entry ${input.id} deleted from ${input.contentType}`,
      }
    },
  )

  return { listEntries, getEntry, createEntry, updateEntry, deleteEntry }
}
