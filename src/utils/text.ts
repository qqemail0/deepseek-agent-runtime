export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }

  const asciiWords = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
  const cjkChars = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const punctuation = Math.ceil((text.length - asciiWords * 4 - cjkChars) / 8);
  return Math.max(1, Math.ceil(asciiWords * 1.3 + cjkChars * 1.1 + Math.max(0, punctuation)));
}

export function truncateByTokens(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) {
    return text;
  }

  const ratio = maxTokens / estimated;
  const keepChars = Math.max(200, Math.floor(text.length * ratio));
  return `${text.slice(0, keepChars)}\n...[truncated ${estimated - maxTokens} estimated tokens]`;
}

export function summarizeOutput(text: string, maxTokens: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  if (estimateTokens(trimmed) <= maxTokens) {
    return trimmed;
  }

  const lines = trimmed.split(/\r?\n/);
  const head = lines.slice(0, 40).join("\n");
  const tail = lines.slice(-20).join("\n");
  return truncateByTokens(`${head}\n\n...[middle omitted: ${Math.max(0, lines.length - 60)} lines]\n\n${tail}`, maxTokens);
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sortKeys(child)])
    );
  }
  return value;
}
