import { describe, it, expect, vi, afterEach } from 'vitest'

// We test loadConfig by controlling env vars and watching process.exit / process.stderr
describe('loadConfig', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  function setEnv(overrides: Record<string, string | undefined>) {
    process.env = { ...originalEnv, ...overrides }
  }

  it('exits with code 1 if STRAPI_URL is missing', async () => {
    setEnv({ STRAPI_URL: undefined, STRAPI_API_TOKEN: 'token' })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { loadConfig } = await import('../src/config.js')
    expect(() => loadConfig()).toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('STRAPI_URL'))
  })

  it('exits with code 1 if STRAPI_API_TOKEN is missing', async () => {
    setEnv({ STRAPI_URL: 'http://localhost:1337', STRAPI_API_TOKEN: undefined })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { loadConfig } = await import('../src/config.js')
    expect(() => loadConfig()).toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('disables search with warning if SEARCH_PROVIDER=tavily but TAVILY_API_KEY missing', async () => {
    setEnv({
      STRAPI_URL: 'http://localhost:1337',
      STRAPI_API_TOKEN: 'token',
      SEARCH_PROVIDER: 'tavily',
      TAVILY_API_KEY: undefined,
    })
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { loadConfig } = await import('../src/config.js')
    const { capabilities } = loadConfig()

    expect(capabilities.search).toBe(false)
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('TAVILY_API_KEY'))
  })

  it('disables AI with warning if AI_PROVIDER=openai but OPENAI_API_KEY missing', async () => {
    setEnv({
      STRAPI_URL: 'http://localhost:1337',
      STRAPI_API_TOKEN: 'token',
      AI_PROVIDER: 'openai',
      AI_MODEL: 'gpt-4o',
      OPENAI_API_KEY: undefined,
    })
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const { loadConfig } = await import('../src/config.js')
    const { capabilities } = loadConfig()

    expect(capabilities.ai).toBe(false)
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('OPENAI_API_KEY'))
  })

  it('returns correct Config and Capabilities when all vars present', async () => {
    setEnv({
      STRAPI_URL: 'http://localhost:1337',
      STRAPI_API_TOKEN: 'mytoken',
      SEARCH_PROVIDER: 'tavily',
      TAVILY_API_KEY: 'tvly-key',
      AI_PROVIDER: 'anthropic',
      AI_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_API_KEY: 'sk-ant-key',
    })

    const { loadConfig } = await import('../src/config.js')
    const { config, capabilities } = loadConfig()

    expect(config.strapi.url).toBe('http://localhost:1337')
    expect(config.strapi.apiToken).toBe('mytoken')
    expect(config.search?.provider).toBe('tavily')
    expect(capabilities.crud).toBe(true)
    expect(capabilities.search).toBe(true)
    expect(capabilities.ai).toBe(true)
  })
})
