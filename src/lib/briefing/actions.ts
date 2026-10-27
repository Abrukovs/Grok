import { createServerFn } from "@tanstack/react-start";
import { SPORTS, type Briefing, type SlimTip, type Sport, type Tip } from "./types";
import { briefingIntro, buildTips, sortByChance } from "./ideas";
import { settleTips } from "./settle";
import { buildBriefingStats } from "./stats";
import { snapshotFromSlim } from "./thesis";
import { allLoggedTips, inflate, rememberDay, stampVerdicts, tipsForDay, toSlim } from "./tip-log.server";
import { moscowDayKey, todayMoscow } from "@/lib/format";

function moscowDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(fallback);
    });
  });
}

function mixBySport(handwritten: Tip[], generated: Tip[], sports: Sport[]): Tip[] {
  const all: Tip[] = [];
  const seen = new Set<string>();
  for (const t of [...handwritten, ...generated]) {
    if (seen.has(t.eventId)) continue;
    seen.add(t.eventId);
    all.push(t);
  }
  const todayKey = todayMoscow();
  const ordered = sortByChance(all).sort((a, b) => {
    const aT = moscowDayKey(a.kickoff) === todayKey ? 0 : 1;
    const bT = moscowDayKey(b.kickoff) === todayKey ? 0 : 1;
    return aT - bT;
  });
  const caps: Partial<Record<Sport, number>> = {
    football: 4,
    tennis: sports.includes("tennis") ? 4 : 1,
    basketball: 2,
    hockey: sports.includes("hockey") ? 2 : 0,
  };
  const tips: Tip[] = [];
  const sportCount: Partial<Record<Sport, number>> = {};
  for (const t of ordered) {
    if (tips.length >= 8) break;
    const cap = caps[t.sport] ?? 2;
    const n = sportCount[t.sport] ?? 0;
    if (n >= cap) continue;
    sportCount[t.sport] = n + 1;
    tips.push(t);
  }
  return sortByChance(tips);
}

const CALM_SPORTS = new Set<Sport>(["football", "tennis", "basketball", "hockey"]);

function calmTips(pool: Tip[]): Tip[] {
  return sortByChance(
    pool.filter((t) => t.risk === "low" && CALM_SPORTS.has(t.sport)),
  ).slice(0, 8);
}

function asSlim(input: unknown): SlimTip | null {
  const t = input as SlimTip;
  if (!t || typeof t.id !== "string" || typeof t.market !== "string") return null;
  if (!t.home?.short || !t.away?.short) return null;
  return {
    id: t.id,
    eventId: String(t.eventId ?? ""),
    sport: t.sport,
    leagueShort: String(t.leagueShort ?? ""),
    league: String(t.league ?? t.leagueShort ?? ""),
    home: { name: String(t.home.name ?? t.home.short), short: t.home.short, logo: t.home.logo },
    away: { name: String(t.away.name ?? t.away.short), short: t.away.short, logo: t.away.logo },
    kickoff: String(t.kickoff ?? ""),
    market: t.market,
    pick: String(t.pick ?? ""),
    oddsHint: String(t.oddsHint ?? ""),
    confidence: (t.confidence as SlimTip["confidence"]) || 3,
    rationale: String(t.rationale ?? ""),
    risk: t.risk || "medium",
    briefingDate: String(t.briefingDate ?? ""),
  };
}

export const getDailyBriefing = createServerFn({ method: "POST" })
  .validator((input: { sports: Sport[]; pending?: SlimTip[] }) => {
    const sports = (input?.sports ?? []).filter((s): s is Sport =>
      (SPORTS as readonly string[]).includes(s),
    );
    const pending = (input?.pending ?? []).map(asSlim).filter((t): t is SlimTip => Boolean(t)).slice(0, 160);
    return { sports: sports.length ? sports : (["football"] as Sport[]), pending };
  })
  .handler(async ({ data }): Promise<Briefing> => {
    const { fetchUpcoming, fetchFinished } = await import("./espn.server");
    const [events, finished] = await Promise.all([
      withTimeout(
        fetchUpcoming(data.sports).catch(() => [] as Awaited<ReturnType<typeof fetchUpcoming>>),
        8000,
        [] as Awaited<ReturnType<typeof fetchUpcoming>>,
      ),
      withTimeout(
        fetchFinished(data.sports).catch(() => [] as Awaited<ReturnType<typeof fetchFinished>>),
        6000,
        [] as Awaited<ReturnType<typeof fetchFinished>>,
      ),
    ]);
    const generatedBase = buildTips(events, 16);
    const { handTips } = await import("./hand");
    const handwritten = handTips(events);
    const used = new Set(handwritten.map((t) => t.eventId));
    const generated = mixBySport(
      handwritten,
      generatedBase.filter((t) => !used.has(t.eventId)),
      data.sports,
    );
    const pool: Tip[] = [];
    const poolSeen = new Set<string>();
    for (const t of [...handwritten, ...generatedBase, ...generated]) {
      if (poolSeen.has(t.eventId)) continue;
      poolSeen.add(t.eventId);
      pool.push(t);
    }
    const calm = calmTips(pool);
    const date = moscowDate();
    if (generated.length) rememberDay(date, generated);
    const byId = new Map<string, Tip>();
    for (const tip of generated) byId.set(tip.id, tip);
    for (const tip of tipsForDay(date)) {
      if (byId.size >= 8) break;
      if (!byId.has(tip.id)) byId.set(tip.id, inflate(tip));
    }
    const tips = sortByChance([...byId.values()]);
    const logged = allLoggedTips();
    const extra = await withTimeout(
      import("./backfill.server").then((m) => m.settleOpenTips(logged)),
      14000,
      [] as Awaited<ReturnType<typeof import("./backfill.server").settleOpenTips>>,
    );
    if (extra.length) stampVerdicts(extra);
    const settledLog = extra.length ? allLoggedTips() : logged;
    const pendingById = new Map<string, SlimTip>();
    for (const tip of settledLog) pendingById.set(tip.id, tip);
    for (const tip of data.pending) pendingById.set(tip.id, tip);
    for (const tip of tips) pendingById.set(tip.id, toSlim(tip, date));
    const closed = settleTips([...pendingById.values()], finished);
    const closedIds = new Set(closed.map((row) => row.tipId));
    for (const row of extra) if (!closedIds.has(row.tipId)) closed.push(row);
    const stats = buildBriefingStats(events, tips);
    const theses = settledLog.map(snapshotFromSlim).filter((t) => t.rationale);
    const savedIdeas = settledLog
      .filter((t) => t.briefingDate && t.home?.short && t.away?.short)
      .map((t) => ({
        date: t.briefingDate,
        sport: t.sport,
        match: `${t.home.short} — ${t.away.short}`,
        league: t.leagueShort || t.league || "",
        market: t.market,
        pick: t.pick,
        verdict: t.verdict,
        score: t.score,
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.match.localeCompare(b.match, "ru"));
    return {
      date,
      timezone: "Europe/Moscow",
      intro: briefingIntro(date, events, tips),
      tips,
      calm,
      live: events.filter((e) => e.state === "in").slice(0, 6),
      matchCount: events.length,
      stats,
      generatedAt: new Date().toISOString(),
      closed,
      theses,
      savedIdeas,
    };
  });

export const askAnalyst = createServerFn({ method: "POST" })
  .validator((input: { message: string; tips: Tip[] }) => ({
    message: String(input?.message ?? "").trim().slice(0, 500),
    tips: Array.isArray(input?.tips) ? input.tips.slice(0, 12) : [],
  }))
  .handler(async ({ data }) => {
    if (!data.message) {
      return { text: "Напишите вопрос по матчу или рынку — разберу в контексте сегодняшнего брифа." };
    }
    const { askGrok } = await import("./grok.server");
    return askGrok({
      message: data.message,
      tips: data.tips,
    });
  });

export const explainMisses = createServerFn({ method: "POST" })
  .validator((input: { misses: unknown }) => {
    const rows = Array.isArray(input?.misses) ? input.misses : [];
    return {
      misses: rows.slice(0, 8).map((row) => {
        const r = (row ?? {}) as Record<string, unknown>;
        return {
          tipId: String(r.tipId ?? ""),
          match: String(r.match ?? "").slice(0, 80),
          market: String(r.market ?? "").slice(0, 40),
          pick: String(r.pick ?? "").slice(0, 60),
          score: r.score ? String(r.score).slice(0, 16) : undefined,
          rationale: r.rationale ? String(r.rationale).slice(0, 280) : undefined,
          leagueShort: r.leagueShort ? String(r.leagueShort).slice(0, 24) : undefined,
        };
      }).filter((m) => m.tipId && m.match),
    };
  })
  .handler(async ({ data }) => {
    if (!data.misses.length) {
      return { summary: "За последние сутки промахов нет.", notes: [] as { tipId: string; note: string }[] };
    }
    const { explainMissesGrok } = await import("./grok.server");
    return explainMissesGrok(data.misses);
  });
