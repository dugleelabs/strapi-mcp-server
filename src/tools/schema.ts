import { z } from 'zod'
import { ErrorCode as EC, formatError, type ToolResult } from '../lib/errors.js'
import { log } from '../lib/logger.js'
import type { StrapiContentType } from '../strapi/types.js'
import type { StrapiClient } from '../strapi/client.js'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  data: StrapiContentType[]
  cachedAt: number
}

// Shared in-process cache across both tools
const schemaCache = new Map<string, CacheEntry>()

async function getCachedContentTypes(client: StrapiClient): Promise<StrapiContentType[]> {
  const key = 'content-types'
  const cached = schemaCache.get(key)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data
  }
  const data = await client.listContentTypes()
  schemaCache.set(key, { data, cachedAt: Date.now() })
  return data
}

function isUserContentType(uid: string): boolean {
  // Exclude Strapi system types (plugin:: prefix) and admin types
  return uid.startsWith('api::')
}

// ── Schemas ──────────────────────────────────────────────────────────────────

export const ListContentTypesInputSchema = z.object({})

export const GetContentTypeSchemaInputSchema = z.object({
  uid: z
    .string()
    .describe('Content type UID, e.g. "api::article.article". Get this from list_content_types.'),
})

// ── Handlers ─────────────────────────────────────────────────────────────────

export function createSchemaTools(client: StrapiClient) {
  async function listContentTypes(
    _input: z.infer<typeof ListContentTypesInputSchema>,
  ): Promise<ToolResult<{ contentTypes: Array<{ uid: string; displayName: string; pluralName: string; kind: string }> }>> {
    log.tool('list_content_types', {})
    try {
      const all = await getCachedContentTypes(client)
      const contentTypes = all
        .filter((ct) => isUserContentType(ct.uid))
        .map((ct) => ({
          uid: ct.uid,
          displayName: ct.schema.displayName,
          pluralName: ct.schema.pluralName,
          kind: ct.schema.kind,
        }))
      return { success: true, data: { contentTypes } }
    } catch (err) {
      if ((err as { success?: boolean }).success === false) {
        return err as Extract<ToolResult<never>, { success: false }>
      }
      return formatError(
        EC.StrapiNetwork,
        `Failed to list content types: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async function getContentTypeSchema(
    input: z.infer<typeof GetContentTypeSchemaInputSchema>,
  ): Promise<ToolResult<{ uid: string; displayName: string; attributes: Record<string, { type: string; required?: boolean; default?: unknown }> }>> {
    log.tool('get_content_type_schema', input)
    try {
      // Check cache first for individual schema
      const cacheKey = `schema:${input.uid}`
      const cached = schemaCache.get(cacheKey)
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        const ct = cached.data[0]
        if (ct) return buildSchemaResult(ct)
      }

      const ct = await client.getContentTypeSchema(input.uid)
      schemaCache.set(cacheKey, { data: [ct], cachedAt: Date.now() })
      return buildSchemaResult(ct)
    } catch (err) {
      if ((err as { success?: boolean }).success === false) {
        return err as Extract<ToolResult<never>, { success: false }>
      }
      return formatError(
        EC.StrapiNetwork,
        `Failed to get schema for "${input.uid}": ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return { listContentTypes, getContentTypeSchema }
}

function buildSchemaResult(ct: StrapiContentType) {
  // Filter out internal Strapi system fields
  const SYSTEM_FIELDS = new Set(['createdAt', 'updatedAt', 'publishedAt', 'createdBy', 'updatedBy'])
  const attributes: Record<string, { type: string; required?: boolean; default?: unknown }> = {}

  for (const [field, attr] of Object.entries(ct.schema.attributes)) {
    if (SYSTEM_FIELDS.has(field)) continue
    attributes[field] = {
      type: attr.type,
      ...(attr.required !== undefined ? { required: attr.required } : {}),
      ...(attr.default !== undefined ? { default: attr.default } : {}),
    }
  }

  return {
    success: true as const,
    data: {
      uid: ct.uid,
      displayName: ct.schema.displayName,
      attributes,
    },
  }
}
