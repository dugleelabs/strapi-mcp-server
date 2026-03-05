export enum ErrorCode {
  StrapiUnauthorised = 'STRAPI_UNAUTHORISED',
  StrapiNotFound = 'STRAPI_NOT_FOUND',
  StrapiValidation = 'STRAPI_VALIDATION',
  StrapiNetwork = 'STRAPI_NETWORK',
  SearchFailed = 'SEARCH_FAILED',
  AIFailed = 'AI_FAILED',
  CapabilityDisabled = 'CAPABILITY_DISABLED',
  InvalidArgument = 'INVALID_ARGUMENT',
}

export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: ErrorCode; details?: unknown }

export function formatError(
  code: ErrorCode,
  message: string,
  details?: unknown,
): Extract<ToolResult<never>, { success: false }> {
  return { success: false, error: message, code, details }
}
