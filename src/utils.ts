export function truncateRawInput(
  input: unknown,
): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const serialized = JSON.stringify(input);
  if (new TextEncoder().encode(serialized).byteLength > 2048) {
    return { _truncated: true, _size: serialized.length };
  }

  return input as Record<string, unknown>;
}

export function clampString(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
