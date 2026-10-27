import { isBigClub, ruLiveCount } from "./names";
import { moscowDayKey, todayMoscow } from "@/lib/format";
import type { MatchEvent, Risk, Sport, Tip } from "./types";

function formPoints(form?: string): number {
  if (!form) return 0;
  const chars = form.replace(/[^WDL]/gi, "").slice(-5).split("");
  const weights = [0.55, 0.7, 0.9, 1.15, 1.4];
  return chars.reduce((sum, ch, i) => {
    const w = weights[i] ?? 1;
    if (ch === "W" || ch === "w") return sum + 3 * w;
    if (ch === "D" || ch === "d") return sum + 1 * w;
    return sum;
  }, 0);
}

function recordWinRate(record?: string): number | null {
  if (!record) return null;
  const parts = record.split("-").map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n)) || parts.length < 2) return null;
  const [w, l, d = 0] = parts;
  const total = w + l + d;
  if (total <= 0) return null;
  return (w + d * 0.33) / total;
}

function sideStrength(side: MatchEvent["home"], homeBoost = 0): number {
  const form = formPoints(side.form);
  const wr = recordWinRate(side.record);
  const recordScore = wr == null ? 6 : wr * 12;
  return form + recordScore + homeBoost;
}

function clampConfidence(n: number): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
}

function oddsFromGap(gap: number, kind: "fav" | "total" | "even"): string {
  if (kind === "even") return "~3.20–3.60";
  if (kind === "total") return gap > 4 ? "~1.70–1.90" : "~1.80–2.05";
  if (gap > 8) return "~1.35–1.55";
  if (gap > 5) return "~1.55–1.80";
  if (gap > 2.5) return "~1.80–2.15";
  return "~2.10–2.50";
}

function formTag(side: MatchEvent["home"]): string {
  const form = side.form?.replace(/[^WDL]/gi, "").slice(-5);
  return form ? ` (${form})` : side.record ? ` (${side.record})` : "";
}

function hoursUntil(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 999;
  return (t - Date.now()) / 36e5;
}

function isTodayKick(iso: string): boolean {
  return moscowDayKey(iso) === todayMoscow();
}

function buildTip(
  event: MatchEvent,
  slice: {
    market: string;
    pick: string;
    oddsHint: string;
    confidence: 1 | 2 | 3 | 4 | 5;
    rationale: string;
    risk: Risk;
  },
): Tip {
  return {
    id: `${event.id}-${slice.market}`,
    eventId: event.id,
    sport: event.sport,
    league: event.league,
    leagueShort: event.leagueShort,
    home: event.home,
    away: event.away,
    kickoff: event.date,
    state: event.state,
    statusText: event.statusText,
    homeScore: event.homeScore,
    awayScore: event.awayScore,
    ...slice,
  };
}

function ideaForEvent(event: MatchEvent, index: number): Tip | null {
  if (event.state !== "pre") return null;

  if (event.sport === "tennis") {
    const tourney = event.leagueShort || event.league;
    const homeStar = isBigClub(event.home.name, event.home.short);
    const awayStar = isBigClub(event.away.name, event.away.short);
    if (homeStar !== awayStar) {
      const fav = homeStar ? event.home : event.away;
      const dog = homeStar ? event.away : event.home;
      return buildTip(event, {
        market: "Победитель",
        pick: fav.short,
        oddsHint: "~1.35–1.70",
        confidence: 4,
        rationale: `${fav.name} заметно выше классом, чем ${dog.name}. ${tourney}: фаворит часто уже сжат — идея только если коэффициент ещё дышит.`,
        risk: "medium",
      });
    }
    const hw = recordWinRate(event.home.record);
    const aw = recordWinRate(event.away.record);
    if (hw != null && aw != null && Math.abs(hw - aw) >= 0.08) {
      const fav = hw > aw ? event.home : event.away;
      const dog = hw > aw ? event.away : event.home;
      return buildTip(event, {
        market: "Победитель",
        pick: fav.short,
        oddsHint: "~1.60–2.10",
        confidence: 3,
        rationale: `${fav.name} выглядит предпочтительнее ${dog.name} по сезону. Турнир: ${tourney}. Узкая гипотеза на победителя, не «железо».`,
        risk: "medium",
      });
    }
    return buildTip(event, {
      market: "Победитель",
      pick: event.home.short,
      oddsHint: "~1.70–2.20",
      confidence: 2,
      rationale: `${event.home.name} — ${event.away.name}, ${tourney}. Явного класса нет, гипотеза острая: покрытие, форма и личные встречи важнее посева.`,
      risk: "high",
    });
  }

  if (event.sport === "mma") {
    return buildTip(event, {
      market: "Победитель",
      pick: event.home.short,
      oddsHint: "~1.70–2.20",
      confidence: 2,
      rationale: `${event.home.short} против ${event.away.short}. По карду без разбора стилей это острая гипотеза: смотрите вес, стойку и, если есть, записи последних боёв.`,
      risk: "high",
    });
  }

  const home = sideStrength(event.home, event.sport === "football" ? 1.35 : 0.4);
  const away = sideStrength(event.away, 0);
  const homeBig = isBigClub(event.home.name, event.home.short);
  const awayBig = isBigClub(event.away.name, event.away.short);
  let gap = home - away;
  if (homeBig && !awayBig) gap += 4.5;
  if (awayBig && !homeBig) gap -= 4.5;
  const abs = Math.abs(gap);
  const favIsHome = gap >= 0;
  const fav = favIsHome ? event.home : event.away;
  const dog = favIsHome ? event.away : event.home;
  const lane = index % 3;

  if (event.sport === "baseball") {
    const pick = favIsHome ? event.home.short : event.away.short;
    return buildTip(event, {
      market: "Победитель",
      pick,
      oddsHint: oddsFromGap(abs, "fav"),
      confidence: clampConfidence(abs > 4 ? 4 : 3),
      rationale: `${fav.short} выглядит чуть стабильнее по сезону, чем ${dog.short}. В MLB это узкая гипотеза на победителя, не «железо».`,
      risk: abs > 5 ? "medium" : "high",
    });
  }

  if (event.sport === "american_football") {
    if (lane === 1) {
      return buildTip(event, {
        market: "Тотал",
        pick: "ТБ 44.5",
        oddsHint: "~1.85–1.95",
        confidence: 3,
        rationale: `Календарный слот ${event.home.short} — ${event.away.short}. Тотал как рабочая гипотеза, если линия около середины сезона; сверяйте с травмами и погодой.`,
        risk: "medium",
      });
    }
    const spread = abs > 6 ? "−6.5" : "−3.0";
    return buildTip(event, {
      market: "Фора",
      pick: `${fav.short} ${spread}`,
      oddsHint: "~1.85–1.95",
      confidence: clampConfidence(abs > 5 ? 4 : 3),
      rationale: `${fav.short} фаворит по форме/записи. Фора обычно ценнее голого исхода, если коэффициент на победу уже сжат.`,
      risk: "medium",
    });
  }

  if (event.sport === "hockey") {
    if (lane === 1) {
      return buildTip(event, {
        market: "Тотал",
        pick: "ТБ 5.5",
        oddsHint: "~1.80–2.00",
        confidence: 3,
        rationale: `${event.home.short} — ${event.away.short}: тотал 5.5 как базовая гипотеза, если оба звена в порядке. В хоккее голый исход часто шумнее.`,
        risk: "medium",
      });
    }
    return buildTip(event, {
      market: "Исход",
      pick: favIsHome ? "П1" : "П2",
      oddsHint: oddsFromGap(abs, "fav"),
      confidence: clampConfidence(abs > 5 ? 4 : 3),
      rationale: `${fav.short} предпочтительнее ${dog.short} по форме. Учитывайте овертайм в линии — «в основное» и «с ОТ» это разные рынки.`,
      risk: "medium",
    });
  }

  if (event.sport === "basketball") {
    const hw = recordWinRate(event.home.record);
    const aw = recordWinRate(event.away.record);
    if (hw == null && aw == null) return null;
    if (
      (event.home.record === "0-0" || event.home.record === "0-0-0") &&
      (event.away.record === "0-0" || event.away.record === "0-0-0")
    ) {
      return null;
    }
    const wnba = /wnba/i.test(event.leagueShort) || /wnba/i.test(event.league);
    const euro = /евролиг/i.test(event.leagueShort) || /евролиг/i.test(event.league);
    if (euro && abs < 2.2) return null;
    if (euro && abs >= 4) {
      return buildTip(event, {
        market: "Исход",
        pick: favIsHome ? "П1" : "П2",
        oddsHint: oddsFromGap(abs, "fav"),
        confidence: clampConfidence(abs > 5 ? 4 : 3),
        rationale: `${fav.short}${formTag(fav)} сильнее ${dog.short}${formTag(dog)} в Евролиге. Пока нет регулярки NBA — прямой исход, без форы.`,
        risk: abs > 5 ? "low" : "medium",
      });
    }
    const spread = wnba || euro
      ? abs > 5 ? "−5.5" : abs > 2.5 ? "−3.5" : "−1.5"
      : abs > 6 ? "−7.5" : abs > 3 ? "−4.5" : "−2.5";
    return buildTip(event, {
      market: "Фора",
      pick: `${fav.short} ${spread}`,
      oddsHint: "~1.85–1.95",
      confidence: clampConfidence(abs > 5 ? 4 : 3),
      rationale: wnba
        ? `${fav.short}${formTag(fav)} предпочтительнее ${dog.short}${formTag(dog)}. WNBA: фора спокойнее голого исхода.`
        : euro
          ? `${fav.short}${formTag(fav)} чуть выше ${dog.short}${formTag(dog)} в Евролиге. Разрыв небольшой — фора, не голый исход.`
          : `${fav.short} выглядит сильнее ${dog.short} по сезону. В НБА фора обычно информативнее победителя.`,
      risk: "medium",
    });
  }

  if (abs < 1.6) {
    if (lane === 0) {
      return buildTip(event, {
        market: "Тотал",
        pick: "ТМ 2.5",
        oddsHint: oddsFromGap(abs, "total"),
        confidence: 3,
        rationale: `Пара ${event.home.short}${formTag(event.home)} — ${event.away.short}${formTag(event.away)} выглядит ровной. В таких матчах чаще работает нижний тотал, чем угадывание победителя.`,
        risk: "medium",
      });
    }
    return buildTip(event, {
      market: "Обе забьют",
      pick: "Да",
      oddsHint: "~1.70–1.95",
      confidence: 3,
      rationale: `Близкий класс ${event.home.short}${formTag(event.home)} и ${event.away.short}${formTag(event.away)}. «Обе забьют» — более мягкая гипотеза, чем исход 1X2.`,
      risk: "medium",
    });
  }

  if (abs > 7 && lane !== 0) {
    const handicap = abs > 10 ? "−1.5" : "−1";
    return buildTip(event, {
      market: "Фора",
      pick: `${fav.short} ${handicap}`,
      oddsHint: "~1.70–2.00",
      confidence: clampConfidence(4),
      rationale: `${fav.short}${formTag(fav)} заметно сильнее ${dog.short}${formTag(dog)} по форме. Голый исход часто слишком дешёвый — разумнее смотреть фору, если линия это подтверждает.`,
      risk: "medium",
    });
  }

  if (lane === 2) {
    return buildTip(event, {
      market: "Тотал",
      pick: "ТБ 2.5",
      oddsHint: oddsFromGap(abs, "total"),
      confidence: 3,
      rationale: `Фаворит ${fav.short}${formTag(fav)} должен держать темп против ${dog.short}${formTag(dog)}. Тотал 2.5 — типовая рабочая идея, если состав не выхолощен ротацией.`,
      risk: "medium",
    });
  }

  const pick = favIsHome ? "П1" : "П2";
  return buildTip(event, {
    market: "Исход",
    pick,
    oddsHint: oddsFromGap(abs, "fav"),
    confidence: clampConfidence(abs > 5 ? 4 : 3),
    rationale: `${fav.short}${formTag(fav)} выглядит предпочтительнее ${dog.short}${formTag(dog)} по недавней форме${favIsHome ? " и домашнему слоту" : ""}. Это оценка линии, не прогноз счёта.`,
    risk: abs > 6 ? "low" : "medium",
  });
}

const LEAGUE_RANK: Record<string, number> = {
  "Лига наций": 0,
  ЧМ: 0,
  Евро: 0,
  РПЛ: 0,
  "US Open": 1,
  ЛЧ: 1,
  АПЛ: 1,
  "Ла Лига": 2,
  "Серия А": 3,
  "Лига 1": 4,
  Бундеслига: 5,
  ЛЕ: 6,
  UFC: 6,
  Чемпионшип: 7,
  Эредивизи: 7,
  Примейра: 7,
  ЛК: 8,
  NHL: 8,
  "ATP Токио": 1,
  "ATP Пекин": 1,
  "WTA Пекин": 1,
  WNBA: 2,
  NBA: 8,
  NFL: 9,
  MLS: 9,
  "Отбор ЧМ": 3,
  "Отбор Евро": 4,
  Товарищеский: 12,
  MLB: 11,
};

export function rankEvent(event: MatchEvent): number {
  const stateRank = event.state === "pre" ? 0 : event.state === "in" ? 1 : 4;
  const leagueRank = LEAGUE_RANK[event.league] ?? LEAGUE_RANK[event.leagueShort] ?? 8;
  const hours = hoursUntil(event.date);
  const today = isTodayKick(event.date);
  const soon = today ? (hours < 6 ? 0 : 2) : hours < 20 ? 80 : hours < 48 ? 120 : 180;
  const star =
    isBigClub(event.home.name, event.home.short) || isBigClub(event.away.name, event.away.short)
      ? 0
      : 6;
  return stateRank * 1000 + soon * 20 + leagueRank + star;
}

const SPORT_CAP: Partial<Record<Sport, number>> = {
  football: 6,
  tennis: 4,
  baseball: 2,
  mma: 1,
  hockey: 2,
  basketball: 3,
  american_football: 2,
};

export function buildTips(events: MatchEvent[], limit = 8): Tip[] {
  const upcoming = events
    .filter((e) => e.state === "pre")
    .sort((a, b) => rankEvent(a) - rankEvent(b));

  const today = upcoming.filter((e) => isTodayKick(e.date));
  const later = upcoming.filter((e) => !isTodayKick(e.date));
  const ordered = [...today, ...later];

  const tips: Tip[] = [];
  const used = new Set<string>();
  const sportCount: Partial<Record<Sport, number>> = {};
  const SECOND_TIER = new Set(["Чемпионшип", "Эредивизи", "Примейра", "MLS"]);
  const NT_LEAGUES = new Set(["Лига наций", "ЧМ", "Евро", "Товарищеский", "Отбор ЧМ", "Отбор Евро"]);
  let secondTier = 0;

  for (const event of ordered) {
    if (tips.length >= limit) break;
    if (used.has(event.id)) continue;
    if (SECOND_TIER.has(event.leagueShort)) {
      if (secondTier >= 1) continue;
    }
    if (NT_LEAGUES.has(event.leagueShort) || NT_LEAGUES.has(event.league)) {
      const ntStar =
        isBigClub(event.home.name, event.home.short) ||
        isBigClub(event.away.name, event.away.short);
      if (!ntStar) continue;
    }
    const n = sportCount[event.sport] ?? 0;
    if (n >= (SPORT_CAP[event.sport] ?? 3)) continue;
    const tip = ideaForEvent(event, tips.length);
    if (!tip) continue;
    used.add(event.id);
    sportCount[event.sport] = n + 1;
    if (SECOND_TIER.has(event.leagueShort)) secondTier += 1;
    tips.push(tip);
  }

  return sortByChance(tips);
}

export function applyAuthored(
  events: MatchEvent[],
  drafts: Array<{
    eventId: string;
    market: string;
    pick: string;
    oddsHint?: string;
    confidence?: number;
    risk?: Risk;
    rationale: string;
  }>,
): Tip[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const tips: Tip[] = [];
  const used = new Set<string>();
  for (const draft of drafts) {
    if (used.has(draft.eventId)) continue;
    const event = byId.get(draft.eventId);
    if (!event || event.state !== "pre") continue;
    const market = draft.market.trim();
    const pick = draft.pick.trim();
    const rationale = draft.rationale.trim();
    if (!market || !pick || rationale.length < 20) continue;
    used.add(event.id);
    tips.push(
      buildTip(event, {
        market: market.slice(0, 40),
        pick: pick.slice(0, 60),
        oddsHint: (draft.oddsHint || "~1.80–2.05").slice(0, 24),
        confidence: clampConfidence(draft.confidence ?? 3),
        rationale: rationale.slice(0, 420),
        risk: draft.risk === "low" || draft.risk === "high" ? draft.risk : "medium",
      }),
    );
    if (tips.length >= 8) break;
  }
  return sortByChance(tips);
}

export function sortByChance<T extends {
  confidence: number;
  risk: Risk;
  kickoff: string;
  leagueShort?: string;
}>(tips: T[]): T[] {
  const riskRank = { low: 2, medium: 1, high: 0 };
  return [...tips].sort((a, b) => {
    const aToday = isTodayKick(a.kickoff) ? 0 : 1;
    const bToday = isTodayKick(b.kickoff) ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const risk = (riskRank[b.risk] ?? 0) - (riskRank[a.risk] ?? 0);
    if (risk) return risk;
    const la = LEAGUE_RANK[a.leagueShort ?? ""] ?? 8;
    const lb = LEAGUE_RANK[b.leagueShort ?? ""] ?? 8;
    if (la !== lb) return la - lb;
    return Date.parse(a.kickoff) - Date.parse(b.kickoff);
  });
}

export function briefingIntro(isoDate: string, events: MatchEvent[], tips: Tip[]): string {
  const day = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${isoDate}T12:00:00+03:00`));

  const todayKey = isoDate;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayTips = tips.filter((t) => fmt.format(new Date(t.kickoff)) === todayKey);
  const leagues = [...new Set((todayTips.length ? todayTips : tips).map((t) => t.leagueShort))].slice(
    0,
    4,
  );
  const liveCount = events.filter((e) => e.state === "in").length;
  const liveBit = liveCount ? ` Сейчас в линии ${ruLiveCount(liveCount)}.` : "";
  const leagueBit = leagues.length ? ` В фокусе: ${leagues.join(", ")}.` : "";
  const later = tips.length - todayTips.length;
  const laterBit =
    todayTips.length && later > 0 ? " Дальше по календарю — выходные топ-лиги." : "";

  return `Бриф · ${day}.${leagueBit}${liveBit}${laterBit} Ниже — список идей, который собрал аналитик по форме и календарю. Не совет ставить и не гарантия.`;
}