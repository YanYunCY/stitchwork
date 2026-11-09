import { parseEvent } from '../quota/ledger.ts';
import type { UsageEvent } from '../quota/ledger.ts';

/** One ledger event as shown on the tray. Counts only (Req 17.5). */
export type RunRow = UsageEvent;

export const RECENT_RUNS = 20;

/**
 * The `n` most recent valid events, newest first (Req 17.1, 17.3).
 * Works on raw ledger lines rather than the in-memory window, so runs older
 * than `windowMinutes` still appear. Ties on `ts` put the later line first.
 */
export function recentRuns(lines: readonly string[], n: number = RECENT_RUNS): RunRow[] {
  const rows: { e: UsageEvent; i: number }[] = [];
  lines.forEach((line, i) => {
    const e = parseEvent(line);
    if (e) rows.push({ e, i });
  });
  rows.sort((a, b) => b.e.ts - a.e.ts || b.i - a.i);
  return rows.slice(0, Math.max(0, n)).map((r) => r.e);
}
