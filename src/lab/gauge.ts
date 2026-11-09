/**
 * Fraction of a quota dimension still available, in [0, 1]; null when the
 * dimension has no limit (Req 16.3). Non-increasing in `used`.
 * The page carries a copy of this function (page-js.ts); a test keeps them equal.
 */
export function gaugeFill(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  if (!(limit > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - used / limit));
}
