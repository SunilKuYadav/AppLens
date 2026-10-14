/**
 * Rough token-count estimate using a chars/4 heuristic.
 *
 * This is intentionally dependency-free (no tokenizer) and approximate — it is
 * used for the Context breakdown (always an estimate) and as a fallback for
 * Input/Output counts when the API omits a usage object.
 *
 * @param text - The text to estimate a token count for
 * @returns An estimated token count (0 for empty/whitespace-free input)
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}
