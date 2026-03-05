import { log } from './lib/logger.js'

export type SearchProviderName = 'tavily' | 'brave' | 'exa'

export interface Config {
  strapi: {
    url: string
    apiToken: string
  }
  search?: {
    provider: SearchProviderName
    apiKey: string
  }
  ai?: {
    provider: string
    model: string
    apiKey?: string
  }
}

export interface Capabilities {
  crud: true
  search: boolean
  ai: boolean
}

const SEARCH_PROVIDER_KEYS: Record<SearchProviderName, string> = {
  tavily: 'TAVILY_API_KEY',
  brave: 'BRAVE_API_KEY',
  exa: 'EXA_API_KEY',
}

const AI_PROVIDER_KEYS: Record<string, string | undefined> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  ollama: undefined, // no API key needed — uses OLLAMA_BASE_URL
}

export function loadConfig(): { config: Config; capabilities: Capabilities } {
  const strapiUrl = process.env['STRAPI_URL']
  const strapiApiToken = process.env['STRAPI_API_TOKEN']

  if (!strapiUrl) {
    process.stderr.write('ERROR: STRAPI_URL is required\n')
    process.exit(1)
  }

  if (!strapiApiToken) {
    process.stderr.write('ERROR: STRAPI_API_TOKEN is required\n')
    process.exit(1)
  }

  const config: Config = {
    strapi: { url: strapiUrl, apiToken: strapiApiToken },
  }

  const capabilities: Capabilities = { crud: true, search: false, ai: false }

  // Search capability
  const searchProvider = process.env['SEARCH_PROVIDER'] as SearchProviderName | undefined
  if (searchProvider) {
    if (!(searchProvider in SEARCH_PROVIDER_KEYS)) {
      log.warn(
        `Unknown SEARCH_PROVIDER "${searchProvider}" — must be one of: tavily, brave, exa. research_topic disabled.`,
      )
    } else {
      const keyName = SEARCH_PROVIDER_KEYS[searchProvider]
      const apiKey = process.env[keyName]
      if (!apiKey) {
        log.warn(`${keyName} not set — research_topic disabled.`)
      } else {
        config.search = { provider: searchProvider, apiKey }
        capabilities.search = true
      }
    }
  }

  // AI capability
  const aiProvider = process.env['AI_PROVIDER']
  const aiModel = process.env['AI_MODEL']
  if (aiProvider) {
    if (!(aiProvider in AI_PROVIDER_KEYS)) {
      log.warn(
        `Unknown AI_PROVIDER "${aiProvider}" — must be one of: openai, anthropic, google, mistral, ollama. AI tools disabled.`,
      )
    } else if (!aiModel) {
      log.warn('AI_MODEL not set — AI tools disabled.')
    } else {
      const keyName = AI_PROVIDER_KEYS[aiProvider]
      if (aiProvider === 'ollama') {
        const ollamaBase = process.env['OLLAMA_BASE_URL']
        if (!ollamaBase) {
          log.warn('OLLAMA_BASE_URL not set — AI tools disabled.')
        } else {
          config.ai = { provider: aiProvider, model: aiModel }
          capabilities.ai = true
        }
      } else if (keyName) {
        const apiKey = process.env[keyName]
        if (!apiKey) {
          log.warn(`${keyName} not set — AI tools disabled.`)
        } else {
          config.ai = { provider: aiProvider, model: aiModel, apiKey }
          capabilities.ai = true
        }
      }
    }
  }

  return { config, capabilities }
}
