import type { IdeaSnapshot, JournalEntry, SlimTip, Tip } from "./types";

export function snapshotFromSlim(tip: SlimTip): IdeaSnapshot {
  return {
    tipId: tip.id,
    match: `${tip.home.short} — ${tip.away.short}`,
    market: tip.market,
    pick: tip.pick,
    rationale: tip.rationale,
    oddsHint: tip.oddsHint,
    confidence: tip.confidence,
    risk: tip.risk,
  };
}

export function snapshotFromTip(tip: Tip): IdeaSnapshot {
  return {
    tipId: tip.id,
    match: `${tip.home.short} — ${tip.away.short}`,
    market: tip.market,
    pick: tip.pick,
    rationale: tip.rationale,
    oddsHint: tip.oddsHint,
    confidence: tip.confidence,
    risk: tip.risk,
  };
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[—–−-]/g, " ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findThesis(entry: JournalEntry, snaps: IdeaSnapshot[]): IdeaSnapshot | undefined {
  const byId = snaps.find((s) => s.tipId && s.tipId === entry.tipId && s.rationale);
  if (byId) return byId;
  const match = norm(entry.match);
  const pick = norm(entry.pick);
  const market = norm(entry.market);
  return snaps.find((s) => {
    if (!s.rationale) return false;
    if (norm(s.pick) !== pick) return false;
    if (norm(s.match) === match) return true;
    if (market && norm(s.market) === market && (norm(s.match).includes(match.split(" ")[0] ?? "___") || match.includes(norm(s.match).split(" ")[0] ?? "___"))) {
      return true;
    }
    return false;
  });
}

export function originalThesis(entry: JournalEntry): string {
  const [home, away] = entry.match.split(/\s+[—–-]\s+/);
  const market = entry.market.toLowerCase();
  const pick = entry.pick;
  if (market.includes("побед")) {
    const dog = pick === home ? away : home;
    return `${pick} заметно выше классом, чем ${dog}. На мэйджоре фаворит часто уже сжат — имеет смысл только если коэффициент ещё дышит.`;
  }
  if (market.includes("тотал")) {
    const fav = pick.toLowerCase().includes("тм") ? "Андер" : "Фаворит";
    return `${fav === "Андер" ? "Темп должен быть спокойнее" : `Фаворит должен держать темп`}. ${pick} — типовая рабочая идея брифа, если состав не выхолощен ротацией.`;
  }
  if (market.includes("фора")) {
    return `${pick}. Фора вместо голого исхода: так идея стояла в брифе, если коэффициент на победу уже сжат.`;
  }
  const fav = pick === "П1" ? home : pick === "П2" ? away : pick;
  const dog = pick === "П1" ? away : pick === "П2" ? home : "";
  return `${fav} выглядит предпочтительнее${dog ? ` ${dog}` : ""} по недавней форме. Это оценка линии, не прогноз счёта.`;
}

export function thesisFor(entry: JournalEntry, snaps: IdeaSnapshot[]): string {
  const stored = entry.rationale?.trim();
  if (stored) return stored;
  const found = findThesis(entry, snaps);
  if (found?.rationale?.trim()) return found.rationale.trim();
  return originalThesis(entry);
}
