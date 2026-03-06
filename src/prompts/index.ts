import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export function registerPrompts(server: McpServer): void {
  server.prompt(
    'dugleelabs/create-blog-from-topic',
    'Research a topic and create a draft blog post in Strapi',
    {
      topic: z.string().describe('The topic to research and write about'),
      contentType: z
        .string()
        .optional()
        .describe('Strapi content type to save the draft in (default: articles)'),
    },
    ({ topic, contentType }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              'Please research the following topic and create a draft blog post, then save it to Strapi.',
              '',
              `Topic: ${topic}`,
              `Content type: ${contentType ?? 'articles'}`,
              '',
              'Steps:',
              '1. Use research_topic to gather current information on the topic',
              '2. Use generate_draft with the research results to create a structured blog post',
              `3. Use get_content_type_schema to check the field names for "${contentType ?? 'articles'}"`,
              '4. Use create_entry to save the draft (do not publish — leave as draft)',
              '5. Return the Strapi admin URL so I can review and edit the draft',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  server.prompt(
    'dugleelabs/list-drafts',
    'Show all unpublished draft entries for a content type',
    {
      contentType: z.string().describe('The Strapi content type to list drafts for'),
    },
    ({ contentType }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Please list all draft (unpublished) entries for the "${contentType}" content type in Strapi.`,
              '',
              `Use the list_entries tool with status "draft" and show me:`,
              '- Entry ID',
              '- Title or name field',
              '- When it was last updated',
              '- Any other key fields',
              '',
              'If there are many entries, show the first page and let me know how many total drafts exist.',
            ].join('\n'),
          },
        },
      ],
    }),
  )

  server.prompt(
    'dugleelabs/review-entry',
    'Fetch a Strapi entry and suggest improvements before publishing',
    {
      contentType: z.string().describe('The Strapi content type'),
      id: z.string().describe('The entry ID to review'),
    },
    ({ contentType, id }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: [
              `Please fetch entry ${id} from the "${contentType}" content type and review it before publishing.`,
              '',
              'Use get_entry to fetch the content, then provide:',
              '1. A summary of what the entry covers',
              '2. Suggested improvements to the title, body, and meta description',
              '3. Any missing sections or content that should be added',
              '4. Grammar or clarity issues',
              '5. Whether it is ready to publish, or what changes are needed first',
            ].join('\n'),
          },
        },
      ],
    }),
  )
}
