import { config } from "../config";

type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const threshold = ORDER[config.logLevel] ?? ORDER.info;

function format(level: LogLevel, scope: string, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const tag = `[${ts}] [${level.toUpperCase()}] [${scope}]`;
  if (meta === undefined) return `${tag} ${message}`;
  try {
    return `${tag} ${message} ${JSON.stringify(meta)}`;
  } catch {
    return `${tag} ${message}`;
  }
}

/**
 * Tiny structured logger. Goals:
 *  - Single dependency-free helper that respects LOG_LEVEL.
 *  - Stable shape: `[timestamp] [LEVEL] [scope] message {meta}` so logs
 *    are still grep-friendly while carrying optional metadata for any
 *    future log shipper.
 *  - `child(scope)` lets each module tag its logs without repeating the
 *    scope string at every call site.
 */
export const logger = {
  child(scope: string) {
    return {
      debug(message: string, meta?: unknown) {
        if (ORDER.debug >= threshold) console.debug(format("debug", scope, message, meta));
      },
      info(message: string, meta?: unknown) {
        if (ORDER.info >= threshold) console.log(format("info", scope, message, meta));
      },
      warn(message: string, meta?: unknown) {
        if (ORDER.warn >= threshold) console.warn(format("warn", scope, message, meta));
      },
      error(message: string, meta?: unknown) {
        if (ORDER.error >= threshold) console.error(format("error", scope, message, meta));
      },
    };
  },
};

export type Logger = ReturnType<typeof logger.child>;
