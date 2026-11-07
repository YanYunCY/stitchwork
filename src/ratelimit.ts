/** Vendor-agnostic rate-limit detection (Req 8.1). */
export const RATE_LIMIT_PATTERN =
  /\b429\b|rate[ _-]?limit(?:ed)?|too many requests|usage limit|quota (?:exceeded|exhausted)|resource[_ ]exhausted/i;

export function isRateLimited(...texts: readonly (string | undefined)[]): boolean {
  return texts.some((t) => typeof t === 'string' && RATE_LIMIT_PATTERN.test(t));
}
