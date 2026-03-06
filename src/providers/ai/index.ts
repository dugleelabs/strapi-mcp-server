import type { LanguageModel } from 'ai'
import type { Config } from '../../config.js'
import { ErrorCode, formatError } from '../../lib/errors.js'

export async function createAIModel(config: NonNullable<Config['ai']>): Promise<LanguageModel> {
  switch (config.provider) {
    case 'anthropic': {
      try {
        const { createAnthropic } = await import('@ai-sdk/anthropic')
        const anthropic = createAnthropic({ apiKey: config.apiKey ?? '' })
        return anthropic(config.model)
      } catch (err) {
        if ((err as { success?: boolean }).success === false) throw err
        throw formatError(
          ErrorCode.CapabilityDisabled,
          'Install @ai-sdk/anthropic to use Anthropic AI tools: pnpm add @ai-sdk/anthropic',
        )
      }
    }
    case 'openai': {
      try {
        const { createOpenAI } = await import('@ai-sdk/openai')
        const openai = createOpenAI({ apiKey: config.apiKey ?? '' })
        return openai(config.model)
      } catch (err) {
        if ((err as { success?: boolean }).success === false) throw err
        throw formatError(
          ErrorCode.CapabilityDisabled,
          'Install @ai-sdk/openai to use OpenAI AI tools: pnpm add @ai-sdk/openai',
        )
      }
    }
    case 'google': {
      try {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
        const google = createGoogleGenerativeAI({ apiKey: config.apiKey ?? '' })
        return google(config.model)
      } catch (err) {
        if ((err as { success?: boolean }).success === false) throw err
        throw formatError(
          ErrorCode.CapabilityDisabled,
          'Install @ai-sdk/google to use Google AI tools: pnpm add @ai-sdk/google',
        )
      }
    }
    case 'mistral': {
      try {
        const { createMistral } = await import('@ai-sdk/mistral')
        const mistral = createMistral({ apiKey: config.apiKey ?? '' })
        return mistral(config.model)
      } catch (err) {
        if ((err as { success?: boolean }).success === false) throw err
        throw formatError(
          ErrorCode.CapabilityDisabled,
          'Install @ai-sdk/mistral to use Mistral AI tools: pnpm add @ai-sdk/mistral',
        )
      }
    }
    case 'ollama': {
      // Ollama is OpenAI-compatible — use @ai-sdk/openai with a custom baseURL
      try {
        const { createOpenAI } = await import('@ai-sdk/openai')
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
        const ollama = createOpenAI({ baseURL: `${ollamaBaseUrl}/v1`, apiKey: 'ollama' })
        return ollama(config.model)
      } catch (err) {
        if ((err as { success?: boolean }).success === false) throw err
        throw formatError(
          ErrorCode.CapabilityDisabled,
          'Install @ai-sdk/openai to use Ollama (OpenAI-compatible): pnpm add @ai-sdk/openai',
        )
      }
    }
    default: {
      throw formatError(
        ErrorCode.InvalidArgument,
        `Unknown AI provider: "${config.provider}". Must be one of: openai, anthropic, google, mistral, ollama.`,
      )
    }
  }
}
