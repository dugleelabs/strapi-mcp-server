import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Capabilities, Config } from './config.js'
import { log } from './lib/logger.js'
import { registerPrompts } from './prompts/index.js'
import type { StrapiClient } from './strapi/client.js'
import {
  CreateEntryInputSchema,
  DeleteEntryInputSchema,
  GetEntryInputSchema,
  ListEntriesInputSchema,
  UpdateEntryInputSchema,
  createCrudTools,
} from './tools/crud.js'
import {
  GetContentTypeSchemaInputSchema,
  ListContentTypesInputSchema,
  createSchemaTools,
} from './tools/schema.js'

// Lazy imports for optional tiers — loaded only if capabilities are enabled
async function loadResearchTool() {
  return import('./tools/research.js')
}
async function loadContentTools() {
  return import('./tools/content.js')
}

export async function createServer(
  config: Config,
  capabilities: Capabilities,
  strapiClient: StrapiClient,
): Promise<McpServer> {
  const { version } = (await import('../package.json', { with: { type: 'json' } })).default

  const server = new McpServer({
    name: '@dugleelabs/strapi-mcp-server',
    version,
  })

  const crud = createCrudTools(strapiClient, config.strapi.url)
  const schema = createSchemaTools(strapiClient)

  // ── Tier 1: CRUD tools (always enabled) ────────────────────────────────────

  server.tool(
    'list_entries',
    'List entries from a Strapi content type. Use list_content_types first if unsure of the content type name.',
    ListEntriesInputSchema.shape,
    async (input) => {
      const result = await crud.listEntries(input)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.tool(
    'get_entry',
    'Fetch a single Strapi entry by content type and ID.',
    GetEntryInputSchema.shape,
    async (input) => {
      const result = await crud.getEntry(input)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.tool(
    'create_entry',
    'Create a new entry in a Strapi content type. Use get_content_type_schema to see available fields before creating.',
    CreateEntryInputSchema.shape,
    async (input) => {
      const result = await crud.createEntry(input)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.tool(
    'update_entry',
    'Update fields of an existing Strapi entry. Only provided fields are updated (partial update).',
    UpdateEntryInputSchema.shape,
    async (input) => {
      const result = await crud.updateEntry(input)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.tool(
    'delete_entry',
    'Permanently delete a Strapi entry by content type and ID.',
    DeleteEntryInputSchema.shape,
    async (input) => {
      const result = await crud.deleteEntry(input)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  // ── Tier 1: Schema tools (always enabled) ──────────────────────────────────

  server.tool(
    'list_content_types',
    'List all content types available in the connected Strapi instance. Use this to discover available content types before performing CRUD operations.',
    ListContentTypesInputSchema.shape,
    async (input) => {
      const result = await schema.listContentTypes(input)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  server.tool(
    'get_content_type_schema',
    'Get the field schema for a Strapi content type — field names, types, and which are required. Use list_content_types first to get the UID.',
    GetContentTypeSchemaInputSchema.shape,
    async (input) => {
      const result = await schema.getContentTypeSchema(input)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  )

  let toolCount = 7

  // ── Tier 2: Search tools (if search configured) ────────────────────────────

  if (capabilities.search && config.search) {
    const { createResearchTool, ResearchTopicInputSchema } = await loadResearchTool()
    const { createSearchProvider } = await import('./providers/search/index.js')
    const searchProvider = createSearchProvider(config.search)
    const researchTool = createResearchTool(searchProvider, capabilities)

    server.tool(
      'research_topic',
      'Search the web for current information on a topic using the configured search provider. Returns structured results suitable for passing to generate_draft.',
      ResearchTopicInputSchema.shape,
      async (input) => {
        const result = await researchTool(input)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      },
    )
    toolCount++
  }

  // ── Tier 3: AI content tools (if AI configured) ────────────────────────────

  if (capabilities.ai && config.ai) {
    const { createContentTools, GenerateDraftInputSchema, CreateContentFromResearchInputSchema } =
      await loadContentTools()
    const { createAIModel } = await import('./providers/ai/index.js')
    const model = await createAIModel(config.ai)

    let searchProvider = undefined
    if (capabilities.search && config.search) {
      const { createSearchProvider } = await import('./providers/search/index.js')
      searchProvider = createSearchProvider(config.search)
    }

    const { generateDraft, createContentFromResearch } = createContentTools(
      model,
      strapiClient,
      searchProvider,
      config.strapi.url,
      capabilities,
    )

    server.tool(
      'generate_draft',
      'Generate a structured blog post draft on a topic using the configured AI provider. Optionally pass research results from research_topic for grounded content.',
      GenerateDraftInputSchema.shape,
      async (input) => {
        const result = await generateDraft(input)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      },
    )
    toolCount++

    if (capabilities.search) {
      server.tool(
        'create_content_from_research',
        'End-to-end: research a topic, generate a draft, and save it to Strapi as a draft entry. Requires both search and AI to be configured.',
        CreateContentFromResearchInputSchema.shape,
        async (input) => {
          const result = await createContentFromResearch(input)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        },
      )
      toolCount++
    }
  }

  // ── Prompts (always registered) ────────────────────────────────────────────

  registerPrompts(server)

  log.info(
    `Tool registration complete — ${toolCount} tools enabled` +
      ` (search: ${capabilities.search}, ai: ${capabilities.ai})`,
  )

  return server
}
