import { RISK_LABEL, SPORT_META } from "./sports";
import type { BriefingStats, DailyStat, JournalEntry, MatchEvent, Risk, SlimTip, Tip } from "./types";

export type FormChar = "W" | "D" | "L";

export function parseForm(form?: string): FormChar[] {
  if (!form) return [];
  return [...form.toUpperCase()]
    .filter((c): c is FormChar => c === "W" || c === "D" || c === "L")
    .slice(-5);
}

export function formWinCount(form: FormChar[]): number {
  return form.filter((c) => c === "W").length;
}

export function buildBriefingStats(events: MatchEvent[], tips: Tip[]): BriefingStats {
  const sportMap = new Map<string, number>();
  for (const tip of tips) {
    sportMap.set(tip.sport, (sportMap.get(tip.sport) ?? 0) + 1);
  }
  const riskMap: Record<Risk, number> = { low: 0, medium: 0, high: 0 };
  for (const tip of tips) riskMap[tip.risk] += 1;
  const marketMap = new Map<string, number>();
  for (const tip of tips) {
    marketMap.set(tip.market, (marketMap.get(tip.market) ?? 0) + 1);
  }
  const avg =
    tips.length === 0
      ? 0
      : Math.round((tips.reduce((s, t) => s + t.confidence, 0) / tips.length) * 10) / 10;

  return {
    matchCount: events.length,
    upcomingCount: events.filter((e) => e.state === "pre").length,
    liveCount: events.filter((e) => e.state === "in").length,
    tipCount: tips.length,
    avgConfidence: avg,
    bySport: [...sportMap.entries()]
      .map(([key, count]) => ({
        key,
        label: SPORT_META[key as Tip["sport"]]?.label ?? key,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    byRisk: (["low", "medium", "high"] as const).map((key) => ({
      key,
      label: RISK_LABEL[key],
      count: riskMap[key],
    })),
    byMarket: [...marketMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function ruNoun(n: number, one: string, few: string, many: string): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} ${one}`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export function journalSummary(entries: JournalEntry[]) {
  const hits = entries.filter((e) => e.verdict === "hit").length;
  const misses = entries.filter((e) => e.verdict === "miss").length;
  const voids = entries.filter((e) => e.verdict === "void").length;
  const decided = hits + misses;
  const rate = decided ? Math.round((hits / decided) * 100) : null;
  return { hits, misses, voids, decided, rate, total: entries.length };
}

export function sportHitRates(entries: JournalEntry[]) {
  const map = new Map<string, { hits: number; misses: number }>();
  for (const entry of entries) {
    if (entry.verdict !== "hit" && entry.verdict !== "miss") continue;
    const cur = map.get(entry.sport) ?? { hits: 0, misses: 0 };
    if (entry.verdict === "hit") cur.hits += 1;
    else cur.misses += 1;
    map.set(entry.sport, cur);
  }
  return [...map.entries()]
    .map(([key, row]) => {
      const decided = row.hits + row.misses;
      return {
        key,
        label: SPORT_META[key as JournalEntry["sport"]]?.label ?? key,
        hits: row.hits,
        misses: row.misses,
        decided,
        rate: decided ? Math.round((row.hits / decided) * 100) : null,
      };
    })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.decided - a.decided);
}

export function buildDaily(journal: JournalEntry[], pending: SlimTip[]): DailyStat[] {
  const dates = new Set<string>();
  for (const row of journal) if (row.briefingDate) dates.add(row.briefingDate);
  for (const tip of pending) if (tip.briefingDate) dates.add(tip.briefingDate);
  return [...dates]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 45)
    .map((date) => {
      const rows = journal.filter((j) => j.briefingDate === date);
      const hits = rows.filter((r) => r.verdict === "hit").length;
      const misses = rows.filter((r) => r.verdict === "miss").length;
      const voids = rows.filter((r) => r.verdict === "void").length;
      const open = pending.filter((t) => t.briefingDate === date && !rows.some((r) => r.tipId === t.id)).length;
      const decided = hits + misses;
      return {
        date,
        hits,
        misses,
        voids,
        pending: open,
        rate: decided ? Math.round((hits / decided) * 100) : null,
      };
    });
}