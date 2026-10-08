/**
 * Redaction utilities for hiding sensitive data before it is stored or shown.
 *
 * Nothing here mutates its input — every function returns a fresh value.
 */

const REDACTED = '[REDACTED]';

/**
 * Return a new header map with any value whose key matches (case-insensitively)
 * an entry in `sensitiveKeys` replaced with '[REDACTED]'. The input is never
 * mutated.
 */
export function redactHeaders(
  headers: Record<string, unknown>,
  sensitiveKeys: string[],
): Record<string, unknown> {
  const lowered = sensitiveKeys.map((k) => k.toLowerCase());
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = lowered.includes(key.toLowerCase()) ? REDACTED : value;
  }
  return result;
}

/**
 * Recursively walk a value, redacting any object property whose key matches
 * (case-insensitively) an entry in `sensitiveFields`. Arrays and plain objects
 * are walked; primitives are returned unchanged. A WeakSet guards against
 * cyclic references.
 */
export function redactFields(obj: unknown, sensitiveFields: string[]): unknown {
  const lowered = sensitiveFields.map((f) => f.toLowerCase());
  const seen = new WeakSet<object>();

  const walk = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (seen.has(value as object)) {
      return value;
    }
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.map((item) => walk(item));
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = lowered.includes(key.toLowerCase()) ? REDACTED : walk(val);
    }
    return result;
  };

  return walk(obj);
}
