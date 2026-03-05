import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { log } from './lib/logger.js'
import { StrapiClient } from './strapi/client.js'
import { createServer } from './server.js'

async function main() {
  const { config, capabilities } = loadConfig()

  const strapiClient = new StrapiClient(config.strapi.url, config.strapi.apiToken)

  try {
    await strapiClient.ping()
  } catch (err) {
    const msg =
      (err as { error?: string }).error ??
      (err instanceof Error ? err.message : String(err))
    process.stderr.write(
      `ERROR: Cannot connect to Strapi at ${config.strapi.url}. Is it running?\n${msg}\n`,
    )
    process.exit(1)
  }

  const server = await createServer(config, capabilities, strapiClient)
  const transport = new StdioServerTransport()
  await server.connect(transport)

  const toolCount = 7 + (capabilities.search ? 1 : 0) + (capabilities.ai ? 1 : 0) + (capabilities.search && capabilities.ai ? 1 : 0)
  log.info(`@dugleelabs/strapi-mcp-server ready — ${toolCount} tools enabled`)
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
