import { settleTips } from "./settle";
import { stampVerdicts } from "./tip-log.server";
import type { MatchEvent, Settlement, SlimTip, Sport } from "./types";

const WEB = "https://site.web.api.espn.com/apis/site/v2/sports";

function ymds(iso: string): string[] {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return [];
  const utc = new Date(t).toISOString().slice(0, 10).replaceAll("-", "");
  const msk = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(t))
    .replaceAll("-", "");
  return [...new Set([utc, msk])];
}

function pathsFor(tip: SlimTip): string[] {
  const league = `${tip.leagueShort} ${tip.league}`.toLowerCase();
  if (tip.sport === "hockey") return ["hockey/nhl"];
  if (tip.sport === "basketball") {
    if (/евролиг/.test(league)) return [];
    if (/wnba/.test(league)) return ["basketball/wnba"];
    return ["basketball/nba"];
  }
  if (tip.sport === "tennis") return [/wta/i.test(league) ? "tennis/wta" : "tennis/atp"];
  if (/нац/.test(league)) return ["soccer/uefa.nations"];
  if (/лч|лига чемпион/.test(league)) return ["soccer/uefa.champions"];
  if (/лига европ|лига европы/.test(league)) return ["soccer/uefa.europa"];
  if (/лига 1/.test(league)) return ["soccer/fra.1"];
  if (/ла лига/.test(league)) return ["soccer/esp.1"];
  if (/серия а/.test(league)) return ["soccer/ita.1"];
  if (/бундес/.test(league)) return ["soccer/ger.1"];
  if (/рпл/.test(league)) return ["soccer/rus.1"];
  if (/апл/.test(league)) return ["soccer/eng.1"];
  if (/mls/.test(league)) return ["soccer/usa.1"];
  if (/примей/.test(league)) return ["soccer/por.1"];
  if (/товар/.test(league)) return ["soccer/fifa.friendly"];
  return ["soccer/uefa.nations", "soccer/uefa.champions", "soccer/eng.1"];
}

type Side = { name?: string; score?: string };

function eventFrom(sport: Sport, id: string, date: string, home: Side, away: Side, state: string): MatchEvent | null {
  if (!home.name || !away.name) return null;
  const post = state === "post" || state === "OFF" || state === "FINAL";
  if (!post) return null;
  const hs = home.score ?? "";
  const as = away.score ?? "";
  if (hs === "" || as === "") return null;
  const hn = Number(hs);
  const an = Number(as);
  return {
    id,
    sport,
    league: "",
    leagueShort: "",
    name: `${home.name} — ${away.name}`,
    shortName: `${home.name} — ${away.name}`,
    home: { name: home.name, short: home.name },
    away: { name: away.name, short: away.name },
    date,
    state: "post",
    statusText: "",
    homeScore: hs,
    awayScore: as,
    winner: hn === an ? undefined : hn > an ? "home" : "away",
  };
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { Accept: "application/json", "User-Agent": "LinerBriefing/1.0" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function fromEspn(sport: Sport, body: unknown): MatchEvent[] {
  const events = (body as { events?: unknown[] })?.events;
  if (!Array.isArray(events)) return tennisFrom(sport, body);
  const out: MatchEvent[] = [];
  for (const raw of events) {
    const ev = raw as {
      id?: string;
      date?: string;
      status?: { type?: { state?: string } };
      competitions?: {
        competitors?: { homeAway?: string; score?: string; team?: { displayName?: string }; athlete?: { displayName?: string } }[];
      }[];
    };
    const comps = ev.competitions?.[0]?.competitors ?? [];
    const home = comps.find((c) => c.homeAway === "home") ?? comps[0];
    const away = comps.find((c) => c.homeAway === "away") ?? comps[1];
    const row = eventFrom(
      sport,
      `espn-${ev.id ?? ""}`,
      ev.date ?? "",
      { name: home?.team?.displayName || home?.athlete?.displayName, score: home?.score },
      { name: away?.team?.displayName || away?.athlete?.displayName, score: away?.score },
      ev.status?.type?.state ?? "",
    );
    if (row) out.push(row);
  }
  return out;
}

function tennisFrom(sport: Sport, body: unknown): MatchEvent[] {
  const events = (body as { events?: unknown[] })?.events;
  if (!Array.isArray(events)) return [];
  const out: MatchEvent[] = [];
  for (const raw of events) {
    const ev = raw as { groupings?: { competitions?: unknown[] }[] };
    for (const group of ev.groupings ?? []) {
      for (const rawComp of group.competitions ?? []) {
        const comp = rawComp as {
          id?: string;
          date?: string;
          status?: { type?: { state?: string } };
          competitors?: { score?: string; winner?: boolean; athlete?: { displayName?: string }; order?: number }[];
        };
        const comps = comp.competitors ?? [];
        const a = comps[0];
        const b = comps[1];
        const row = eventFrom(
          sport,
          `ten-${comp.id ?? out.length}`,
          comp.date ?? "",
          { name: a?.athlete?.displayName, score: a?.winner ? "1" : a?.score ?? (comp.status?.type?.state === "post" ? "0" : "") },
          { name: b?.athlete?.displayName, score: b?.winner ? "1" : b?.score ?? (comp.status?.type?.state === "post" ? "0" : "") },
          comp.status?.type?.state ?? "",
        );
        if (row && (a?.winner || b?.winner)) {
          row.winner = a?.winner ? "home" : "away";
          row.homeScore = a?.winner ? "1" : "0";
          row.awayScore = b?.winner ? "1" : "0";
          out.push(row);
        }
      }
    }
  }
  return out;
}

async function nhlDay(isoDay: string): Promise<MatchEvent[]> {
  const body = await getJson(`https://api-web.nhle.com/v1/score/${isoDay}`);
  const games = (body as { games?: unknown[] } | null)?.games;
  if (!Array.isArray(games)) return [];
  const out: MatchEvent[] = [];
  for (const raw of games) {
    const g = raw as {
      id?: number;
      startTimeUTC?: string;
      gameState?: string;
      homeTeam?: { score?: number; abbrev?: string; commonName?: { default?: string }; name?: { default?: string } };
      awayTeam?: { score?: number; abbrev?: string; commonName?: { default?: string }; name?: { default?: string } };
    };
    const row = eventFrom(
      "hockey",
      `nhl-${g.id ?? out.length}`,
      g.startTimeUTC ?? `${isoDay}T00:00:00Z`,
      {
        name: g.homeTeam?.commonName?.default || g.homeTeam?.name?.default || g.homeTeam?.abbrev,
        score: g.homeTeam?.score == null ? "" : String(g.homeTeam.score),
      },
      {
        name: g.awayTeam?.commonName?.default || g.awayTeam?.name?.default || g.awayTeam?.abbrev,
        score: g.awayTeam?.score == null ? "" : String(g.awayTeam.score),
      },
      g.gameState === "OFF" || g.gameState === "FINAL" ? "post" : g.gameState ?? "",
    );
    if (row) out.push(row);
  }
  return out;
}

async function euroleague(): Promise<MatchEvent[]> {
  const body = await getJson("https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games");
  const games = (body as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(games)) return [];
  const out: MatchEvent[] = [];
  for (const raw of games) {
    const g = raw as {
      identifier?: string;
      played?: boolean;
      utcDate?: string;
      local?: { score?: number; club?: { editorialName?: string; name?: string } };
      road?: { score?: number; club?: { editorialName?: string; name?: string } };
    };
    if (!g.played) continue;
    const row = eventFrom(
      "basketball",
      `el-${g.identifier ?? out.length}`,
      g.utcDate ?? "",
      { name: g.local?.club?.editorialName || g.local?.club?.name, score: String(g.local?.score ?? "") },
      { name: g.road?.club?.editorialName || g.road?.club?.name, score: String(g.road?.score ?? "") },
      "post",
    );
    if (row) out.push(row);
  }
  return out;
}

const FSIGN = "SW9D1eZo";

function dayOffset(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const kick = Date.parse(`${new Date(t).toISOString().slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((kick - today) / 864e5);
}

function fsField(rec: string, key: string): string {
  const m = rec.match(new RegExp(`${key}÷([^¬]*)`));
  return m?.[1] ?? "";
}

function fromFlash(text: string, sport: Sport): MatchEvent[] {
  const out: MatchEvent[] = [];
  for (const rec of text.split("~")) {
    if (fsField(rec, "AB") !== "3") continue;
    const unix = Number(fsField(rec, "AD"));
    const row = eventFrom(
      sport,
      `fs-${fsField(rec, "AA") || out.length}`,
      Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString() : "",
      { name: fsField(rec, "AE"), score: fsField(rec, "AG") },
      { name: fsField(rec, "AF"), score: fsField(rec, "AH") },
      "post",
    );
    if (row) out.push(row);
  }
  return out;
}

async function flashDay(sport: Sport, offset: number): Promise<MatchEvent[]> {
  const code = sport === "tennis" ? 2 : 1;
  try {
    const res = await fetch(`https://global.flashscore.ninja/2/x/feed/f_${code}_${offset}_2_en_1`, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0", "x-fsign": FSIGN, Referer: "https://www.flashscore.com/" },
    });
    if (!res.ok) return [];
    const text = await res.text();
    return text.length > 20 ? fromFlash(text, sport) : [];
  } catch {
    return [];
  }
}

const LEAGUE_PAGES: [RegExp, string][] = [
  [/нац/i, "https://www.flashscore.com/football/europe/uefa-nations-league/results/"],
  [/лч|чемпион/i, "https://www.flashscore.com/football/europe/champions-league/results/"],
  [/ла лига/i, "https://www.flashscore.com/football/spain/laliga/results/"],
  [/лига 1/i, "https://www.flashscore.com/football/france/ligue-1/results/"],
  [/серия а/i, "https://www.flashscore.com/football/italy/serie-a/results/"],
  [/рпл/i, "https://www.flashscore.com/football/russia/premier-league/results/"],
  [/апл/i, "https://www.flashscore.com/football/england/premier-league/results/"],
  [/товар/i, "https://www.flashscore.com/football/world/friendly-international/results/"],
];

async function flashPage(url: string): Promise<MatchEvent[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return [];
    return fromFlash(await res.text(), "football");
  } catch {
    return [];
  }
}

async function tennisExplorer(kind: "atp-single" | "wta-single", isoDay: string): Promise<MatchEvent[]> {
  const [y, m, d] = isoDay.split("-");
  if (!y || !m || !d) return [];
  try {
    const res = await fetch(
      `https://www.tennisexplorer.com/matches/?type=${kind}&year=${y}&month=${Number(m)}&day=${Number(d)}`,
      { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!res.ok) return [];
    const html = await res.text();
    const rows = [
      ...html.matchAll(
        /<tr id="(r\d+)"[\s\S]*?<td class="t-name">\s*<a [^>]*>([^<]+)<\/a>[\s\S]*?<td class="result">(\d+)<\/td>[\s\S]*?<tr id="\1b"[\s\S]*?<td class="t-name">\s*<a [^>]*>([^<]+)<\/a>[\s\S]*?<td class="result">(\d+)<\/td>/g,
      ),
    ];
    const out: MatchEvent[] = [];
    rows.forEach((match, index) => {
      const home = match[2].trim();
      const away = match[4].trim();
      const hs = match[3];
      const as = match[5];
      if (hs === as) return;
      const event = eventFrom(
        "tennis",
        `te-${isoDay}-${index}`,
        `${isoDay}T12:00:00Z`,
        { name: home, score: hs },
        { name: away, score: as },
        "post",
      );
      if (!event) return;
      event.winner = Number(hs) > Number(as) ? "home" : "away";
      out.push(event);
    });
    return out;
  } catch {
    return [];
  }
}

async function mapPool<T>(items: T[], n: number, fn: (item: T) => Promise<MatchEvent[]>): Promise<MatchEvent[]> {
  const out: MatchEvent[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      const rows = await fn(items[idx]);
      out.push(...rows);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  return out;
}

export async function settleOpenTips(tips: SlimTip[]): Promise<Settlement[]> {
  const open = tips.filter((tip) => !tip.verdict && Date.parse(tip.kickoff) < Date.now() - 2 * 60 * 60 * 1000);
  if (!open.length) return [];

  const jobs: { kind: "espn" | "nhl" | "flash" | "page" | "te"; sport: Sport; path?: string; date?: string; iso?: string; offset?: number; url?: string; tour?: "atp-single" | "wta-single" }[] = [];
  const seen = new Set<string>();
  const push = (key: string, job: (typeof jobs)[number]) => {
    if (seen.has(key)) return;
    seen.add(key);
    jobs.push(job);
  };

  for (const tip of open) {
    if (tip.sport === "hockey") {
      for (const ymd of ymds(tip.kickoff)) {
        const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
        push(`nhl:${iso}`, { kind: "nhl", sport: "hockey", iso });
      }
      continue;
    }
    const off = dayOffset(tip.kickoff);
    if (off != null && off >= -8 && off <= 1 && (tip.sport === "football" || tip.sport === "tennis")) {
      push(`fs:${tip.sport}:${off}`, { kind: "flash", sport: tip.sport, offset: off });
    }
    if (tip.sport === "tennis") {
      const iso = new Date(tip.kickoff).toISOString().slice(0, 10);
      const tour = /wta/i.test(`${tip.league} ${tip.leagueShort}`) ? "wta-single" : "atp-single";
      push(`te:${tour}:${iso}`, { kind: "te", sport: "tennis", iso, tour });
    }
    if (tip.sport === "football") {
      const league = `${tip.leagueShort} ${tip.league}`;
      for (const [re, url] of LEAGUE_PAGES) {
        if (re.test(league)) push(`page:${url}`, { kind: "page", sport: "football", url });
      }
    }
    for (const path of pathsFor(tip)) {
      if (path.startsWith("tennis/")) {
        push(`ten:${path}`, { kind: "espn", sport: tip.sport, path });
        continue;
      }
      for (const ymd of ymds(tip.kickoff)) {
        push(`${path}:${ymd}`, { kind: "espn", sport: tip.sport, path, date: ymd });
      }
      if (path === "soccer/uefa.nations") push("nations", { kind: "espn", sport: "football", path });
    }
  }
  if (open.some((tip) => /евролиг/i.test(tip.leagueShort) || /евролиг/i.test(tip.league))) {
    push("euro", { kind: "espn", sport: "basketball", path: "euroleague" });
  }

  const boards = await mapPool(jobs, 5, async (job) => {
    if (job.kind === "nhl" && job.iso) return nhlDay(job.iso);
    if (job.kind === "flash" && job.offset != null) return flashDay(job.sport, job.offset);
    if (job.kind === "page" && job.url) return flashPage(job.url);
    if (job.kind === "te" && job.iso && job.tour) return tennisExplorer(job.tour, job.iso);
    if (job.path === "euroleague") return euroleague();
    if (!job.path) return [];
    const url = `${WEB}/${job.path}/scoreboard${job.date ? `?dates=${job.date}` : ""}`;
    const body = await getJson(url);
    return body ? fromEspn(job.sport, body) : [];
  });
  const rows = settleTips(open, boards);
  stampVerdicts(rows);
  return rows;
}
