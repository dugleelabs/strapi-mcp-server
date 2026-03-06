# @dugleelabs/strapi-mcp-server

[![PR Validation](https://github.com/dugleelabs/strapi-mcp-server/actions/workflows/pull_request.yaml/badge.svg)](https://github.com/dugleelabs/strapi-mcp-server/actions/workflows/pull_request.yaml)
[![Semantic Release](https://github.com/dugleelabs/strapi-mcp-server/actions/workflows/release.yaml/badge.svg)](https://github.com/dugleelabs/strapi-mcp-server/actions/workflows/release.yaml)
[![GitHub Release](https://img.shields.io/github/v/release/dugleelabs/strapi-mcp-server)](https://github.com/dugleelabs/strapi-mcp-server/releases/latest)

A general-purpose, open-source MCP server for Strapi v4. Exposes Strapi CRUD and schema introspection as MCP tools, with optional AI content generation (research + draft) via the Vercel AI SDK and configurable web search providers. Use it with Claude Desktop, Cursor, or any MCP-compatible agent to manage content through natural language — or automate content creation pipelines entirely.

---

## Prerequisites

- Node.js 20+
- pnpm (or npm/npx)
- A running Strapi v4 instance with an API token

---

## Quick Start

Copy the env vars and run with `pnpm dlx`:

```bash
STRAPI_URL=http://localhost:1337 \
STRAPI_API_TOKEN=your-token-here \
pnpm dlx @dugleelabs/strapi-mcp-server
```

The server starts over stdio and is ready to use immediately. All configuration is via environment variables — no install step required.

---

## Claude Desktop Configuration

Add this to your `claude_desktop_config.json` (usually at `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "strapi": {
      "command": "pnpm",
      "args": ["dlx", "@dugleelabs/strapi-mcp-server"],
      "env": {
        "STRAPI_URL": "http://localhost:1337",
        "STRAPI_API_TOKEN": "your-token-here",
        "AI_PROVIDER": "anthropic",
        "AI_MODEL": "claude-sonnet-4-6",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "SEARCH_PROVIDER": "tavily",
        "TAVILY_API_KEY": "tvly-..."
      }
    }
  }
}
```

---

## Environment Variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `STRAPI_URL` | **Yes** | Base URL of your Strapi instance | `http://localhost:1337` |
| `STRAPI_API_TOKEN` | **Yes** | Strapi API token (Full Access or scoped) | `abc123...` |
| `SEARCH_PROVIDER` | No | Enables `research_topic`: `tavily`, `brave`, or `exa` | `tavily` |
| `TAVILY_API_KEY` | If `SEARCH_PROVIDER=tavily` | Tavily API key | `tvly-...` |
| `BRAVE_API_KEY` | If `SEARCH_PROVIDER=brave` | Brave Search API key | `BSA...` |
| `EXA_API_KEY` | If `SEARCH_PROVIDER=exa` | Exa API key | `exa-...` |
| `AI_PROVIDER` | No | Enables AI tools: `openai`, `anthropic`, `google`, `mistral`, `ollama` | `anthropic` |
| `AI_MODEL` | If `AI_PROVIDER` set | Model name for the selected provider | `claude-sonnet-4-6` |
| `ANTHROPIC_API_KEY` | If `AI_PROVIDER=anthropic` | Anthropic API key | `sk-ant-...` |
| `OPENAI_API_KEY` | If `AI_PROVIDER=openai` | OpenAI API key | `sk-...` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | If `AI_PROVIDER=google` | Google AI API key | `AIza...` |
| `MISTRAL_API_KEY` | If `AI_PROVIDER=mistral` | Mistral API key | `...` |
| `OLLAMA_BASE_URL` | If `AI_PROVIDER=ollama` | Ollama base URL | `http://localhost:11434` |

---

## Tools

### Tier 1 — CRUD (always enabled)

#### `list_entries`
List entries from a Strapi content type.

```json
{
  "contentType": "articles",
  "page": 1,
  "pageSize": 25,
  "status": "draft",
  "filters": { "title": { "$contains": "AI" } }
}
```

Returns: `{ entries, total, page, pageCount }`

---

#### `get_entry`
Fetch a single entry by ID.

```json
{ "contentType": "articles", "id": 42 }
```

Returns: `{ entry }`

---

#### `create_entry`
Create a new entry. Use `get_content_type_schema` first to see available fields.

```json
{
  "contentType": "articles",
  "data": { "title": "My Post", "content": "..." },
  "publish": false
}
```

Returns: `{ id, adminUrl, entry }`

---

#### `update_entry`
Partially update an existing entry.

```json
{
  "contentType": "articles",
  "id": 42,
  "data": { "title": "Updated Title" }
}
```

Returns: `{ id, entry }`

---

#### `delete_entry`
Permanently delete an entry.

```json
{ "contentType": "articles", "id": 42 }
```

Returns: `{ success: true, message: "Entry 42 deleted from articles" }`

---

#### `list_content_types`
List all content types in the Strapi instance. Use this to discover available types before CRUD operations.

No input required.

Returns: `{ contentTypes: [{ uid, displayName, pluralName, kind }] }`

---

#### `get_content_type_schema`
Get the field schema for a content type — field names, types, and required status.

```json
{ "uid": "api::article.article" }
```

Returns: `{ uid, displayName, attributes: { [field]: { type, required, default } } }`

---

### Tier 2 — Search (requires `SEARCH_PROVIDER`)

#### `research_topic`
Search the web for current information on a topic.

```json
{
  "topic": "TypeScript 2026 trends",
  "context": "developer tooling",
  "maxResults": 10
}
```

Returns: `{ query, results: [{ title, url, content, score }], provider }`

---

### Tier 3 — AI Content (requires `AI_PROVIDER`)

#### `generate_draft`
Generate a structured blog post draft using the configured AI provider.

```json
{
  "topic": "TypeScript 2026 trends",
  "researchResults": [...],
  "styleGuide": "Write tersely for senior engineers.",
  "targetWordCount": 800
}
```

Returns: `{ title, body, metaDescription, tags, wordCount }`

---

#### `create_content_from_research`
End-to-end: research a topic → generate a draft → save to Strapi. Requires both search and AI configured.

```json
{
  "topic": "TypeScript 2026 trends",
  "contentType": "articles",
  "context": "focus on tooling and DX",
  "styleGuide": "Terse, developer-focused.",
  "fieldMapping": {
    "title": "title",
    "body": "content",
    "metaDescription": "seo_description",
    "tags": "tags"
  }
}
```

> **Note on `fieldMapping`:** Every Strapi instance has different field names. Provide `fieldMapping` to match your content type's actual fields. If omitted, draft keys are used as-is (`title`, `body`, `metaDescription`, `tags`).

Returns: `{ strapiId, adminUrl, title, wordCount, step }`

---

## MCP Prompts

Three prompts are registered as slash commands in MCP clients:

| Prompt | Arguments | Description |
|---|---|---|
| `dugleelabs/create-blog-from-topic` | `topic` (required), `contentType` (optional) | Research a topic and create a draft blog post in Strapi |
| `dugleelabs/list-drafts` | `contentType` (required) | Show all unpublished drafts for a content type |
| `dugleelabs/review-entry` | `contentType`, `id` (both required) | Fetch an entry and suggest improvements before publishing |

---

## Search Providers

### Tavily
```bash
SEARCH_PROVIDER=tavily TAVILY_API_KEY=tvly-...
```
Get an API key at [tavily.com](https://tavily.com).

### Brave Search
```bash
SEARCH_PROVIDER=brave BRAVE_API_KEY=BSA...
```
Get an API key at [brave.com/search/api](https://brave.com/search/api).

### Exa
```bash
SEARCH_PROVIDER=exa EXA_API_KEY=exa-...
```
Get an API key at [exa.ai](https://exa.ai).

---

## AI Providers

Install only the provider package you need:

### Anthropic (Claude)
```bash
pnpm add @ai-sdk/anthropic
AI_PROVIDER=anthropic AI_MODEL=claude-sonnet-4-6 ANTHROPIC_API_KEY=sk-ant-...
```

### OpenAI
```bash
pnpm add @ai-sdk/openai
AI_PROVIDER=openai AI_MODEL=gpt-4o OPENAI_API_KEY=sk-...
```

### Google
```bash
pnpm add @ai-sdk/google
AI_PROVIDER=google AI_MODEL=gemini-1.5-pro GOOGLE_GENERATIVE_AI_API_KEY=AIza...
```

### Mistral
```bash
pnpm add @ai-sdk/mistral
AI_PROVIDER=mistral AI_MODEL=mistral-large-latest MISTRAL_API_KEY=...
```

### Ollama (local)
```bash
pnpm add @ai-sdk/openai
AI_PROVIDER=ollama AI_MODEL=llama3 OLLAMA_BASE_URL=http://localhost:11434
```

---

## Known Limitations

- **Schema introspection requires Full Access token:** The `list_content_types` and `get_content_type_schema` tools use Strapi's content-type-builder API, which may return 403 with restricted tokens. CRUD tools work with any scoped token that has the appropriate permissions.

- **`pnpm dlx` latency:** Running via `pnpm dlx` downloads the package on every invocation, which adds ~2–5 seconds of startup latency in Claude Desktop. To avoid this, install globally: `pnpm add -g @dugleelabs/strapi-mcp-server`.

- **Strapi v4 only:** Targets the Strapi v4 REST API. Strapi v5 support is planned.

- **No content type assumptions:** The server does not assume any specific field names. Always use `get_content_type_schema` or provide `fieldMapping` to match your Strapi schema.

---

## Contributing

Issues and PRs welcome at [github.com/dugleelabs/strapi-mcp-server](https://github.com/dugleelabs/strapi-mcp-server).

```bash
git clone git@github.com:dugleelabs/strapi-mcp-server.git
cd strapi-mcp-server
pnpm install
cp .env.example .env  # fill in STRAPI_URL and STRAPI_API_TOKEN
pnpm test
pnpm build
```

Use [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for interactive local testing:

```bash
pnpm dlx @modelcontextprotocol/inspector pnpm start
```

---

## License

MIT — see [LICENSE](./LICENSE).
