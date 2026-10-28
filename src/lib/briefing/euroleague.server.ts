import type { MatchEvent } from "./types";

type ElClub = {
  code: string;
  name: string;
  editorialName?: string;
  abbreviatedName?: string;
  images?: { crest?: string };
};

type ElGame = {
  identifier?: string;
  played?: boolean;
  utcDate?: string;
  phaseType?: { code?: string };
  local: { club: ElClub; score?: number };
  road: { club: ElClub; score?: number };
};

const CLUB_RU: Record<string, string> = {
  "real madrid": "Реал",
  real: "Реал",
  barca: "Барселона",
  barcelona: "Барселона",
  olympiacos: "Олимпиакос",
  panathinaikos: "Панатинаикос",
  fenerbahce: "Фенербахче",
  efes: "Эфес",
  zalgiris: "Жальгирис",
  partizan: "Партизан",
  "crvena zvezda": "Црвена Звезда",
  crvena: "Црвена Звезда",
  virtus: "Виртус",
  baskonia: "Баскония",
  valencia: "Валенсия",
  milan: "Милан",
  maccabi: "Маккаби",
  asvel: "АСВЕЛ",
  paris: "Париж",
  hapoel: "Хапоэль",
  bayern: "Бавария",
  besiktas: "Бешикташ",
  dubai: "Дубай",
};

const URL = "https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games";

let cache: { at: number; games: ElGame[] } | null = null;

function ruName(club: ElClub): string {
  const raw = (club.editorialName || club.abbreviatedName || club.name || "").trim();
  const key = raw.toLowerCase();
  if (CLUB_RU[key]) return CLUB_RU[key];
  for (const [needle, ru] of Object.entries(CLUB_RU)) {
    if (key.includes(needle)) return ru;
  }
  return raw || club.code;
}

async function loadGames(): Promise<ElGame[]> {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache.games;
  const res = await fetch(URL, {
    signal: AbortSignal.timeout(6000),
    headers: { Accept: "application/json", "User-Agent": "LinerBriefing/1.0" },
  });
  if (!res.ok) throw new Error(`euroleague ${res.status}`);
  const body = (await res.json()) as { data?: ElGame[] };
  const games = (body.data ?? []).filter((g) => g.phaseType?.code === "RS" && g.utcDate);
  cache = { at: Date.now(), games };
  return games;
}

function records(games: ElGame[]): Map<string, string> {
  const tally = new Map<string, { w: number; l: number }>();
  for (const g of games) {
    if (!g.played) continue;
    const hs = g.local.score ?? 0;
    const as = g.road.score ?? 0;
    if (!hs && !as) continue;
    const hw = hs > as;
    for (const [code, win] of [
      [g.local.club.code, hw],
      [g.road.club.code, !hw],
    ] as const) {
      const row = tally.get(code) ?? { w: 0, l: 0 };
      if (win) row.w += 1;
      else row.l += 1;
      tally.set(code, row);
    }
  }
  const out = new Map<string, string>();
  for (const [code, row] of tally) out.set(code, `${row.w}-${row.l}`);
  return out;
}

function toEvent(g: ElGame, rec: Map<string, string>, now: number): MatchEvent | null {
  const t = Date.parse(g.utcDate || "");
  if (Number.isNaN(t)) return null;
  const homeName = ruName(g.local.club);
  const awayName = ruName(g.road.club);
  const state = g.played ? "post" : t <= now ? "in" : "pre";
  return {
    id: `el-${g.identifier || g.utcDate}-${g.local.club.code}`,
    sport: "basketball",
    league: "Евролига",
    leagueShort: "Евролига",
    name: `${homeName} — ${awayName}`,
    shortName: `${homeName} — ${awayName}`,
    home: {
      name: homeName,
      short: homeName,
      record: rec.get(g.local.club.code),
      logo: g.local.club.images?.crest,
    },
    away: {
      name: awayName,
      short: awayName,
      record: rec.get(g.road.club.code),
      logo: g.road.club.images?.crest,
    },
    date: g.utcDate || "",
    state,
    statusText: "Евролига",
    homeScore: state === "pre" ? undefined : String(g.local.score ?? ""),
    awayScore: state === "pre" ? undefined : String(g.road.score ?? ""),
    winner: state === "post" ? ((g.local.score ?? 0) > (g.road.score ?? 0) ? "home" : "away") : undefined,
  };
}

export async function fetchEuroleague(now = Date.now()): Promise<{ upcoming: MatchEvent[]; finished: MatchEvent[] }> {
  const games = await loadGames();
  const rec = records(games);
  const upcoming: MatchEvent[] = [];
  const finished: MatchEvent[] = [];
  for (const g of games) {
    const ev = toEvent(g, rec, now);
    if (!ev) continue;
    const t = Date.parse(ev.date);
    if (ev.state !== "post" && t >= now - 3 * 3600_000 && t <= now + 36 * 3600_000) upcoming.push(ev);
    if (ev.state === "post" && t >= now - 3 * 864e5) finished.push(ev);
  }
  return { upcoming, finished };
}
