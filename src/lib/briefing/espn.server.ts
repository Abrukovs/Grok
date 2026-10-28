import { isBigClub, ruLeague, ruTeam, ruTennis, ruTennisRound, tennisShortName } from "./names";
import type { MatchEvent, Side, Sport } from "./types";

type FeedMode = "range" | "tournament" | "card";

type Feed = { sport: Sport; path: string; mode: FeedMode };

const FEEDS: Feed[] = [
  { sport: "football", path: "soccer/uefa.nations", mode: "range" },
  { sport: "football", path: "soccer/fifa.friendly", mode: "range" },
  { sport: "football", path: "soccer/fifa.world", mode: "range" },
  { sport: "football", path: "soccer/uefa.euro", mode: "range" },
  { sport: "football", path: "soccer/rus.1", mode: "range" },
  { sport: "football", path: "soccer/eng.1", mode: "range" },
  { sport: "football", path: "soccer/esp.1", mode: "range" },
  { sport: "football", path: "soccer/ita.1", mode: "range" },
  { sport: "football", path: "soccer/fra.1", mode: "range" },
  { sport: "football", path: "soccer/ger.1", mode: "range" },
  { sport: "football", path: "soccer/ned.1", mode: "range" },
  { sport: "football", path: "soccer/por.1", mode: "range" },
  { sport: "football", path: "soccer/usa.1", mode: "range" },
  { sport: "football", path: "soccer/uefa.champions", mode: "range" },
  { sport: "football", path: "soccer/uefa.europa", mode: "range" },
  { sport: "football", path: "soccer/eng.2", mode: "range" },
  { sport: "american_football", path: "football/nfl", mode: "range" },
  { sport: "baseball", path: "baseball/mlb", mode: "range" },
  { sport: "hockey", path: "hockey/nhl", mode: "range" },
  { sport: "hockey", path: "hockey/rus.1", mode: "range" },
  { sport: "basketball", path: "basketball/nba", mode: "range" },
  { sport: "basketball", path: "basketball/wnba", mode: "range" },
  { sport: "mma", path: "mma/ufc", mode: "card" },
  { sport: "tennis", path: "tennis/atp", mode: "tournament" },
  { sport: "tennis", path: "tennis/wta", mode: "tournament" },
];

const UA = "LinerBriefing/1.0";

type EspnCompetitor = {
  homeAway?: string;
  order?: number;
  score?: string;
  form?: string;
  winner?: boolean;
  records?: { summary?: string }[];
  athlete?: {
    displayName?: string;
    shortName?: string;
    fullName?: string;
    headshot?: string;
    flag?: { href?: string };
  };
  team?: {
    displayName?: string;
    shortDisplayName?: string;
    abbreviation?: string;
    logo?: string;
  };
};

type EspnCompetition = {
  id?: string;
  date?: string;
  startDate?: string;
  venue?: { court?: string; fullName?: string };
  competitors?: EspnCompetitor[];
  status?: { type?: { state?: string; shortDetail?: string; description?: string } };
};

type EspnEvent = {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  season?: { slug?: string; type?: number; year?: number };
  status?: { type?: { state?: string; shortDetail?: string; description?: string } };
  competitions?: EspnCompetition[];
  groupings?: { grouping?: { slug?: string; displayName?: string }; competitions?: EspnCompetition[] }[];
};

type EspnBoard = {
  leagues?: {
    name?: string;
    abbreviation?: string;
    shortName?: string;
    season?: { type?: { name?: string; abbreviation?: string } };
  }[];
  events?: EspnEvent[];
};

type CacheEntry = { at: number; events: MatchEvent[] };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_VER = "v10";
const FEED_CONCURRENCY = 5;
const FETCH_MS = 5000;

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function moscowDateList(days: number): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = fmt.format(new Date());
  const start = new Date(`${todayStr}T12:00:00+03:00`);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    out.push(fmt.format(d).replaceAll("-", ""));
  }
  return out;
}

function moscowDateListBack(days: number): string[] {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = fmt.format(new Date());
  const start = new Date(`${todayStr}T12:00:00+03:00`);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() - i * 24 * 60 * 60 * 1000);
    out.push(fmt.format(d).replaceAll("-", ""));
  }
  return out;
}

function ghostName(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^(tbd|tba|n\/a|-|—|игрок)$/i.test(t)) return true;
  if (/\//.test(t)) return true;
  return false;
}

function asState(raw?: string): MatchEvent["state"] {
  if (raw === "in") return "in";
  if (raw === "post") return "post";
  return "pre";
}

function sideFrom(comp: EspnCompetitor | undefined): Side {
  const athlete = comp?.athlete;
  if (athlete?.displayName || athlete?.fullName) {
    const name = athlete.displayName || athlete.fullName || "Игрок";
    return {
      name,
      short: athlete.shortName || name,
      record: comp?.records?.[0]?.summary,
      logo: athlete.flag?.href || athlete.headshot,
    };
  }
  const team = comp?.team ?? {};
  return {
    name: team.displayName || team.shortDisplayName || "Команда",
    short: team.shortDisplayName || team.abbreviation || team.displayName || "—",
    form: comp?.form,
    record: comp?.records?.[0]?.summary,
    logo: team.logo,
  };
}

function pairSides(
  comps: EspnCompetitor[],
  kind: "team" | "athlete" = "team",
): { home: Side; away: Side } | null {
  if (comps.length < 2) return null;
  const homeComp =
    comps.find((c) => c.homeAway === "home") ??
    comps.find((c) => c.order === 1) ??
    comps[0];
  const awayComp =
    comps.find((c) => c.homeAway === "away" && c !== homeComp) ??
    comps.find((c) => c !== homeComp) ??
    comps[1];
  if (!homeComp || !awayComp) return null;
  const rawHome = sideFrom(homeComp);
  const rawAway = sideFrom(awayComp);
  if (kind === "athlete") {
    return {
      home: { ...rawHome, short: tennisShortName(rawHome.name) },
      away: { ...rawAway, short: tennisShortName(rawAway.name) },
    };
  }
  const home = ruTeam(rawHome.name, rawHome.short);
  const away = ruTeam(rawAway.name, rawAway.short);
  return {
    home: { ...rawHome, name: home.name, short: home.short },
    away: { ...rawAway, name: away.name, short: away.short },
  };
}

function mapLeague(board: EspnBoard, fallback: string) {
  const leagueName = board.leagues?.[0]?.name || fallback;
  return ruLeague(
    leagueName,
    board.leagues?.[0]?.abbreviation || board.leagues?.[0]?.shortName || leagueName,
  );
}

function mergeBoards(boards: (EspnBoard | null)[]): EspnBoard {
  const events: EspnEvent[] = [];
  const seen = new Set<string>();
  let leagues: EspnBoard["leagues"];
  for (const board of boards) {
    if (!board) continue;
    if (!leagues && board.leagues?.length) leagues = board.leagues;
    for (const ev of board.events ?? []) {
      const id = String(ev.id ?? `${ev.date}-${ev.shortName}-${ev.name}`);
      if (seen.has(id)) continue;
      seen.add(id);
      events.push(ev);
    }
  }
  return { leagues, events };
}

function scoreboardUrls(feed: Feed, days: string[]): string[] {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${feed.path}/scoreboard`;
  if (feed.mode !== "range") return [base];
  const uniq = [...new Set(days)].slice(0, 2);
  return uniq.map((d) => `${base}?dates=${d}`);
}

async function fetchFeed(feed: Feed, days: string[], now: number, finished = false): Promise<MatchEvent[]> {
  const boards = await Promise.all(scoreboardUrls(feed, days).map(fetchJson));
  const merged = mergeBoards(boards);
  if (!merged.events?.length) return [];
  return parseBoard(feed, merged, now, finished);
}

async function fetchJson(url: string): Promise<EspnBoard | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_MS),
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as EspnBoard;
  } catch {
    return null;
  }
}

function toEvent(input: {
  id: string;
  sport: Sport;
  league: { name: string; short: string };
  name: string;
  shortName: string;
  home: Side;
  away: Side;
  date: string;
  state: MatchEvent["state"];
  statusText: string;
  homeScore?: string;
  awayScore?: string;
  winner?: "home" | "away";
}): MatchEvent {
  return {
    id: input.id,
    sport: input.sport,
    league: input.league.name,
    leagueShort: input.league.short,
    name: input.name,
    shortName: input.shortName,
    home: input.home,
    away: input.away,
    date: input.date,
    state: input.state,
    statusText: input.statusText,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    winner: input.winner,
  };
}

function fromTeamEvent(
  sport: Sport,
  league: { name: string; short: string },
  ev: EspnEvent,
  fallbackPath: string,
): MatchEvent | null {
  const comps = ev.competitions?.[0]?.competitors ?? [];
  const sides = pairSides(comps);
  if (!sides) return null;
  if (ghostName(sides.home.name) || ghostName(sides.away.name)) return null;
  const state = asState(ev.status?.type?.state);
  const homeComp = comps.find((c) => c.homeAway === "home") ?? comps[0];
  const awayComp = comps.find((c) => c.homeAway === "away") ?? comps[1];
  const winner = homeComp?.winner ? "home" : awayComp?.winner ? "away" : undefined;
  return toEvent({
    id: String(ev.id ?? `${fallbackPath}-${ev.date}-${ev.shortName}`),
    sport,
    league,
    name: ev.name || `${sides.home.name} — ${sides.away.name}`,
    shortName: ev.shortName || ev.name || "",
    home: sides.home,
    away: sides.away,
    date: ev.date || new Date().toISOString(),
    state,
    statusText: ev.status?.type?.shortDetail || ev.status?.type?.description || "",
    homeScore: state === "pre" ? undefined : homeComp?.score,
    awayScore: state === "pre" ? undefined : awayComp?.score,
    winner,
  });
}

function fromCompetition(
  sport: Sport,
  league: { name: string; short: string },
  eventName: string,
  comp: EspnCompetition,
  idPrefix: string,
): MatchEvent | null {
  const sides = pairSides(comp.competitors ?? [], sport === "tennis" ? "athlete" : "team");
  if (!sides) return null;
  if (sport === "tennis" && (ghostName(sides.home.name) || ghostName(sides.away.name))) return null;
  const state = asState(comp.status?.type?.state);
  const comps = comp.competitors ?? [];
  const homeComp = comps.find((c) => c.homeAway === "home") ?? comps[0];
  const awayComp = comps.find((c) => c !== homeComp) ?? comps[1];
  const date = comp.date || comp.startDate || new Date().toISOString();
  const court = comp.venue?.court;
  const detail = comp.status?.type?.shortDetail || comp.status?.type?.description || "";
  const winner = homeComp?.winner ? "home" : awayComp?.winner ? "away" : undefined;
  return toEvent({
    id: `${idPrefix}-${comp.id ?? date}`,
    sport,
    league,
    name: `${sides.home.name} — ${sides.away.name}`,
    shortName: eventName,
    home: sides.home,
    away: sides.away,
    date,
    state,
    statusText: [court, detail].filter(Boolean).join(" · "),
    homeScore: state === "pre" ? undefined : homeComp?.score,
    awayScore: state === "pre" ? undefined : awayComp?.score,
    winner,
  });
}

function tennisCourtBoost(court?: string): number {
  const c = (court || "").toLowerCase();
  if (/ashe|centre|center|stadium|rod laver|philippe/.test(c)) return 0;
  if (/\blouis\b|\barmstrong\b|court 1\b|court 2\b/.test(c)) return 8;
  return 16;
}

function tennisTier(league: string): number {
  if (/пекин|токио|шанхай|indian wells|майами|us open|уимблдон|ролан|цинциннати|мадрид|рим|париж/i.test(league)) {
    return 0;
  }
  if (/jingshan|adana|калдаш|guadalajara|гвадалахара/i.test(league)) return 2;
  return 1;
}

function pickTennis(events: MatchEvent[], now: number): MatchEvent[] {
  const horizon = now + 5 * 24 * 60 * 60 * 1000;
  return events
    .filter((e) => {
      if (e.state === "post") return false;
      if (ghostName(e.home.name) || ghostName(e.away.name)) return false;
      const t = Date.parse(e.date);
      if (Number.isNaN(t)) return false;
      if (e.state === "in") return true;
      return t >= now - 60 * 60 * 1000 && t <= horizon;
    })
    .sort((a, b) => {
      const as = a.state === "in" ? 0 : 1;
      const bs = b.state === "in" ? 0 : 1;
      if (as !== bs) return as - bs;
      const aStar =
        isBigClub(a.home.name, a.home.short) || isBigClub(a.away.name, a.away.short) ? 0 : 1;
      const bStar =
        isBigClub(b.home.name, b.home.short) || isBigClub(b.away.name, b.away.short) ? 0 : 1;
      if (aStar !== bStar) return aStar - bStar;
      const tier = tennisTier(a.leagueShort) - tennisTier(b.leagueShort);
      if (tier) return tier;
      const court = tennisCourtBoost(a.statusText) - tennisCourtBoost(b.statusText);
      if (court) return court;
      return Date.parse(a.date) - Date.parse(b.date);
    })
    .slice(0, 24);
}

function pickTennisFinished(events: MatchEvent[], now: number): MatchEvent[] {
  return events
    .filter((e) => {
      if (e.state !== "post") return false;
      const t = Date.parse(e.date);
      return !Number.isNaN(t) && t >= now - 72 * 60 * 60 * 1000;
    })
    .slice(0, 60);
}

function parseBoard(feed: Feed, board: EspnBoard, now: number, finished = false): MatchEvent[] {
  if (!board) return [];
  const events: MatchEvent[] = [];
  const seasonName = board.leagues?.[0]?.season?.type?.name || "";
  if (
    feed.path === "basketball/nba" &&
    !finished &&
    /preseason/i.test(seasonName)
  ) {
    return [];
  }

  if (feed.mode === "tournament") {
    const tour = feed.path.includes("wta") ? "WTA" : "ATP";
    for (const ev of board.events ?? []) {
      const tournament = ruTennis(ev.name || board.leagues?.[0]?.name || tour, tour);
      for (const group of ev.groupings ?? []) {
        const slug = `${group.grouping?.slug || ""} ${group.grouping?.displayName || ""}`.toLowerCase();
        if (slug.includes("double")) continue;
        if (tour === "ATP" && slug.includes("women")) continue;
        if (tour === "WTA" && slug.includes("men") && !slug.includes("women")) continue;
        const round = ruTennisRound(group.grouping?.displayName || group.grouping?.slug || "");
        const labeled = round
          ? { name: `${tournament.name} · ${round}`, short: `${tournament.short} · ${round}` }
          : tournament;
        for (const comp of group.competitions ?? []) {
          const mapped = fromCompetition(
            feed.sport,
            labeled,
            ev.name || tournament.name,
            comp,
            `ten-${ev.id ?? "x"}`,
          );
          if (mapped) events.push(mapped);
        }
      }
    }
    return finished ? pickTennisFinished(events, now) : pickTennis(events, now);
  }

  const league = mapLeague(board, feed.path);

  if (feed.mode === "card") {
    for (const ev of board.events ?? []) {
      const cardLeague = ruLeague(ev.name || league.name, league.short);
      const comps = ev.competitions ?? [];
      if (comps.length <= 1) {
        const mapped = fromTeamEvent(feed.sport, cardLeague, ev, feed.path);
        if (mapped) events.push(mapped);
        continue;
      }
      for (const comp of comps) {
        const mapped = fromCompetition(
          feed.sport,
          { name: "UFC", short: "UFC" },
          ev.name || "UFC",
          comp,
          `mma-${ev.id ?? "x"}`,
        );
        if (mapped) events.push(mapped);
      }
    }
    return (finished ? events : events.filter((e) => e.state !== "post")).slice(0, 8);
  }

  for (const ev of board.events ?? []) {
    const mapped = fromTeamEvent(feed.sport, league, ev, feed.path);
    if (mapped) events.push(mapped);
  }
  return events;
}

export async function fetchUpcoming(sports: Sport[]): Promise<MatchEvent[]> {
  const wanted = [...new Set(sports)].sort();
  const key = `${CACHE_VER}:${moscowDateList(1)[0]}:${wanted.join(",")}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.events;

  const days = moscowDateList(2);
  const now = Date.now();
  const feeds = FEEDS.filter((feed) => wanted.includes(feed.sport));
  const chunks = await mapPool(feeds, FEED_CONCURRENCY, (feed) => fetchFeed(feed, days, now));
  const seen = new Set<string>();
  const all: MatchEvent[] = [];
  for (const chunk of chunks) {
    for (const ev of chunk) {
      if (ev.state === "post") continue;
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      all.push(ev);
    }
  }
  try {
    const { fetchEuroleague } = await import("./euroleague.server");
    const extra = await fetchEuroleague(now);
    for (const ev of extra.upcoming) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      all.push(ev);
    }
  } catch {
    /* евролига не должна ронять бриф */
  }
  if (all.length) CACHE.set(key, { at: Date.now(), events: all });
  else if (hit) return hit.events;
  return all;
}

export async function fetchFinished(sports: Sport[]): Promise<MatchEvent[]> {
  const wanted = [...new Set(sports)].sort();
  const key = `${CACHE_VER}:fin:${moscowDateListBack(1)[0]}:${wanted.join(",")}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.events;

  const days = moscowDateListBack(2);
  const now = Date.now();
  const feeds = FEEDS.filter((feed) => wanted.includes(feed.sport));
  const chunks = await mapPool(feeds, FEED_CONCURRENCY, (feed) => fetchFeed(feed, days, now, true));
  const seen = new Set<string>();
  const all: MatchEvent[] = [];
  for (const chunk of chunks) {
    for (const ev of chunk) {
      if (ev.state !== "post") continue;
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      all.push(ev);
    }
  }
  try {
    const { fetchEuroleague } = await import("./euroleague.server");
    const extra = await fetchEuroleague(now);
    for (const ev of extra.finished) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      all.push(ev);
    }
  } catch {
    /* ignore */
  }
  if (all.length) CACHE.set(key, { at: Date.now(), events: all });
  else if (hit) return hit.events;
  return all;
}
