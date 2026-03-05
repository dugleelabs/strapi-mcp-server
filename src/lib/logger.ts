// Redact values that look like API keys: >20 chars, only alphanumeric + - _
const SECRET_PATTERN = /[A-Za-z0-9\-_]{21,}/g

function redact(value: string): string {
  return value.replace(SECRET_PATTERN, '[REDACTED]')
}

function serialize(value: unknown): string {
  return redact(JSON.stringify(value, null, 2))
}

function write(level: string, message: string): void {
  process.stderr.write(`[${level}] ${redact(message)}\n`)
}

export const log = {
  info: (message: string) => write('INFO', message),
  warn: (message: string) => write('WARN', message),
  error: (message: string) => write('ERROR', message),
  tool: (name: string, args: unknown) =>
    write('TOOL', `${name} ${serialize(args)}`),
}
