type LogLevel = "INFO" | "WARN" | "ERROR"

type LogContext = Record<string, unknown>

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context || {}),
  }

  const line = JSON.stringify(record)
  if (level === "ERROR") {
    console.error(line)
    return
  }
  if (level === "WARN") {
    console.warn(line)
    return
  }
  console.log(line)
}

export function logInfo(message: string, context?: LogContext): void {
  emit("INFO", message, context)
}

export function logWarn(message: string, context?: LogContext): void {
  emit("WARN", message, context)
}

export function logError(message: string, context?: LogContext): void {
  emit("ERROR", message, context)
}

/**
 * Module-scoped logger factory.
 * Returns a logger with the module name baked in, reducing boilerplate.
 *
 * Usage:
 *   const log = createLogger("webhooks")
 *   log.info("Portfolio update received", { totalValueUsd: 1234 })
 *   // => {"timestamp":"...","level":"INFO","module":"webhooks","message":"Portfolio update received","totalValueUsd":1234}
 */
export interface ModuleLogger {
  info: (message: string, context?: LogContext) => void
  warn: (message: string, context?: LogContext) => void
  error: (message: string, context?: LogContext) => void
}

export function createLogger(module: string): ModuleLogger {
  return {
    info: (message: string, context?: LogContext) =>
      emit("INFO", message, { module, ...context }),
    warn: (message: string, context?: LogContext) =>
      emit("WARN", message, { module, ...context }),
    error: (message: string, context?: LogContext) =>
      emit("ERROR", message, { module, ...context }),
  }
}
