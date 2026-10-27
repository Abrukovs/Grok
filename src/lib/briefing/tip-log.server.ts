import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SlimTip, Tip } from "./types";

const FILE = "/workspace/data/briefing-log.json";

const SEED: Record<string, SlimTip[]> = {
  "2026-08-27": [
    {
      id: "seed-barca-ath-fora",
      eventId: "",
      sport: "football",
      league: "Ла Лига",
      leagueShort: "Ла Лига",
      home: { name: "Barcelona", short: "Барселона" },
      away: { name: "Athletic Club", short: "Атлетик" },
      kickoff: "2026-08-27T19:00:00.000Z",
      market: "Фора",
      pick: "Барселона −1.5",
      oddsHint: "~1.70–2.00",
      confidence: 4,
      rationale: "",
      risk: "medium",
      briefingDate: "2026-08-27",
    },
    {
      id: "seed-celta-osa-fora",
      eventId: "",
      sport: "football",
      league: "Ла Лига",
      leagueShort: "Ла Лига",
      home: { name: "Celta Vigo", short: "Сельта" },
      away: { name: "Osasuna", short: "Осасуна" },
      kickoff: "2026-08-27T18:30:00.000Z",
      market: "Фора",
      pick: "Сельта −1",
      oddsHint: "~1.70–2.00",
      confidence: 4,
      rationale: "",
      risk: "medium",
      briefingDate: "2026-08-27",
    },
  ],
};

let memory: Record<string, SlimTip[]> | null = null;

function load(): Record<string, SlimTip[]> {
  if (memory) return memory;
  try {
    const raw = readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, SlimTip[]>;
    memory = parsed && typeof parsed === "object" ? parsed : { ...SEED };
  } catch {
    memory = { ...SEED };
  }
  return memory;
}

function save(log: Record<string, SlimTip[]>) {
  memory = log;
  const next = JSON.stringify(log);
  try {
    const prev = readFileSync(FILE, "utf8");
    if (prev === next) return;
  } catch {
    /* first write */
  }
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, next);
}

export function toSlim(tip: Tip, briefingDate: string): SlimTip {
  return {
    id: tip.id,
    eventId: tip.eventId,
    sport: tip.sport,
    league: tip.league,
    leagueShort: tip.leagueShort,
    home: { name: tip.home.name, short: tip.home.short, logo: tip.home.logo },
    away: { name: tip.away.name, short: tip.away.short, logo: tip.away.logo },
    kickoff: tip.kickoff,
    market: tip.market,
    pick: tip.pick,
    oddsHint: tip.oddsHint,
    confidence: tip.confidence,
    rationale: tip.rationale,
    risk: tip.risk,
    briefingDate,
  };
}

export function inflate(tip: SlimTip): Tip {
  return {
    id: tip.id,
    eventId: tip.eventId,
    sport: tip.sport,
    league: tip.league || tip.leagueShort,
    leagueShort: tip.leagueShort,
    home: { name: tip.home.name, short: tip.home.short, logo: tip.home.logo },
    away: { name: tip.away.name, short: tip.away.short, logo: tip.away.logo },
    kickoff: tip.kickoff,
    state: "pre",
    statusText: "",
    market: tip.market,
    pick: tip.pick,
    oddsHint: tip.oddsHint || "",
    confidence: tip.confidence || 3,
    rationale: tip.rationale || "Идея из дневного брифа. Счёт обновляется отдельно в журнале.",
    risk: tip.risk || "medium",
  };
}

export function rememberDay(date: string, tips: Tip[]) {
  if (!tips.length) return;
  const log = load();
  const byId = new Map((log[date] ?? []).map((t) => [t.id, t]));
  for (const tip of tips) {
    const prev = byId.get(tip.id);
    const next = toSlim(tip, date);
    if (prev?.verdict) {
      next.verdict = prev.verdict;
      next.score = prev.score;
    }
    byId.set(tip.id, next);
  }
  log[date] = [...byId.values()];
  const keys = Object.keys(log).sort();
  while (keys.length > 62) {
    const old = keys.shift();
    if (old) delete log[old];
  }
  save(log);
}

export function stampVerdicts(rows: { tipId: string; verdict: SlimTip["verdict"]; score?: string }[]) {
  const fresh = rows.filter((row) => row.tipId && row.verdict);
  if (!fresh.length) return;
  const log = load();
  const byId = new Map(fresh.map((row) => [row.tipId, row]));
  let changed = false;
  for (const day of Object.keys(log)) {
    log[day] = (log[day] ?? []).map((tip) => {
      const hit = byId.get(tip.id);
      if (!hit?.verdict || tip.verdict) return tip;
      changed = true;
      return { ...tip, verdict: hit.verdict, score: hit.score };
    });
  }
  if (changed) save(log);
}

export function tipsForDay(date: string): SlimTip[] {
  return load()[date] ?? [];
}

export function allLoggedTips(): SlimTip[] {
  const log = load();
  return Object.values(log).flat();
}