type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const REDACTED_KEYS = /pass(word)?|secret|token|authorization|cookie|signature/i;

function serialise(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (depth > 3 || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serialise(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      REDACTED_KEYS.test(key) ? "[redacted]" : serialise(inner, depth + 1),
    ]),
  );
}

export function formatLog(level: Level, event: string, fields: Fields = {}, now = new Date()) {
  return JSON.stringify({
    time: now.toISOString(),
    level,
    event,
    ...(serialise(fields) as Fields),
  });
}

function write(level: Level, event: string, fields?: Fields) {
  const line = formatLog(level, event, fields);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (event: string, fields?: Fields) => write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function resolveRequestId(inbound: string | null): string {
  return inbound && REQUEST_ID.test(inbound) ? inbound : crypto.randomUUID();
}
