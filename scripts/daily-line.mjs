// Daily conservative line. Runs in GitHub Actions. No secrets.
// Writes docs/daily/YYYY-MM-DD.md (Moscow date).

const NOW = Date.now();
const HORIZON = 18 * 3600 * 1000;
const FS = { "User-Agent": "Mozilla/5.0", "x-fsign": "SW9D1eZo", Referer: "https://www.flashscore.com/" };

function field(rec, k) {
  const m = rec.match(new RegExp(k + "÷([^¬]*)"));
  return m ? m[1] : "";
}
function mskParts(ms) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const g = (t) => parts.find((p) => p.type === t).value;
  return { y: g("year"), m: g("month"), d: g("day"), hm: `${g("hour")}:${g("minute")}` };
}
function moscowDate(ms = NOW) {
  const p = mskParts(ms);
  return `${p.y}-${p.m}-${p.d}`;
}
function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(fc|sc|cf|ac|afc|sv|vfl|vfb|rc|cd|ud|fk|bk|sk|club|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
async function getJson(url, headers) {
  const res = await fetch(url, { headers: headers || { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
async function getText(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const ALIAS = [
  ["koln", "cologne"],
  ["cologne", "koln"],
  ["bayern munich", "bayern"],
  ["internazionale", "inter"],
  ["athletic club", "athletic bilbao"],
  ["ath bilbao", "athletic"],
  ["atletico madrid", "atletico"],
  ["real sociedad", "sociedad"],
  ["psg", "paris saint germain"],
  ["paris saint germain", "psg"],
  ["red bull bragantino", "bragantino"],
  ["dynamo moscow", "dinamo moscow"],
  ["dinamo moscow", "dynamo moscow"],
  ["cska moscow", "cska"],
  ["spartak moscow", "spartak"],
  ["zenit st petersburg", "zenit"],
  ["krylia sovetov", "krylya sovetov"],
  ["krylya sovetov", "sovetov"],
  ["le havre ac", "le havre"],
  ["as nancy lorraine", "nancy"],
  ["stade lavallois", "laval"],
  ["olympiakos", "olympiacos"],
  ["crimson zvezda", "crvena zvezda"],
];

function keysOf(name) {
  const n = norm(name);
  const keys = new Set([n]);
  for (const [a, b] of ALIAS) {
    if (n.includes(a)) keys.add(n.replace(a, b).replace(/\s+/g, " ").trim());
  }
  return [...keys].filter((k) => k.length > 2);
}

function findTeam(index, name) {
  const keys = keysOf(name);
  for (const k of keys) {
    if (index.has(k)) return index.get(k);
  }
  let best = null;
  for (const [k, row] of index) {
    for (const q of keys) {
      if (q.length < 5 || k.length < 5) continue;
      if (k.includes(q) || q.includes(k)) {
        const score = Math.min(k.length, q.length);
        if (!best || score > best.score) best = { score, row };
      }
    }
  }
  return best ? best.row : null;
}

async function espnTable(path) {
  const body = await getJson(`https://site.web.api.espn.com/apis/v2/sports/${path}/standings`);
  const groups = body.children?.length ? body.children : [{ standings: body.standings }];
  const rows = [];
  for (const g of groups) {
    for (const [i, e] of (g.standings?.entries || []).entries()) {
      const stats = Object.fromEntries((e.stats || []).map((x) => [x.name, x]));
      const num = (k) => Number(stats[k]?.value ?? stats[k]?.displayValue);
      rows.push({
        name: e.team?.displayName || "",
        rank: Number(stats.rank?.displayValue || i + 1),
        pts: num("points"),
        wins: num("wins"),
        losses: num("losses"),
        ties: num("ties"),
        gp: num("gamesPlayed"),
      });
    }
  }
  return rows.filter((r) => r.name && Number.isFinite(r.pts));
}

const FOOT_LEAGUES = [
  ["soccer/eng.1", "АПЛ"],
  ["soccer/eng.2", "Чемпионшип"],
  ["soccer/esp.1", "Ла Лига"],
  ["soccer/esp.2", "Сегунда"],
  ["soccer/ita.1", "Серия А"],
  ["soccer/ita.2", "Серия B"],
  ["soccer/ger.1", "Бундеслига"],
  ["soccer/ger.2", "Вторая Бундеслига"],
  ["soccer/fra.1", "Лига 1"],
  ["soccer/fra.2", "Лига 2"],
  ["soccer/ned.1", "Эредивизи"],
  ["soccer/por.1", "Примейра"],
  ["soccer/rus.1", "РПЛ"],
  ["soccer/bel.1", "Бельгия"],
  ["soccer/sco.1", "Шотландия"],
  ["soccer/tur.1", "Суперлига"],
  ["soccer/bra.1", "Бразилия"],
  ["soccer/bra.2", "Бразилия B"],
];
const TOUR_OK = /ENGLAND: Premier League$|ENGLAND: Championship$|SPAIN: LaLiga$|SPAIN: LaLiga2$|ITALY: Serie A$|ITALY: Serie B$|GERMANY: Bundesliga$|GERMANY: 2\. Bundesliga$|FRANCE: Ligue 1$|FRANCE: Ligue 2$|NETHERLANDS: Eredivisie$|PORTUGAL: Liga Portugal$|RUSSIA: Premier League$|TURKEY: Super Lig$|BELGIUM: Jupiler Pro League$|SCOTLAND: Premiership$|BRAZIL: Serie A$|BRAZIL: Serie B$/;

async function footballIdeas() {
  const index = new Map();
  const leagueOf = new Map();
  for (const [path, title] of FOOT_LEAGUES) {
    try {
      const rows = await espnTable(path);
      for (const row of rows) {
        row.league = title;
        for (const k of keysOf(row.name)) {
          if (!index.has(k)) index.set(k, row);
        }
        leagueOf.set(row, title);
      }
    } catch (err) {
      console.error("table", path, err.message);
    }
  }
  const ideas = [];
  const seen = new Set();
  for (const off of [0, 1]) {
    let text = "";
    try {
      text = await getText(`https://global.flashscore.ninja/2/x/feed/f_1_${off}_2_en_1`, FS);
    } catch (err) {
      console.error("foot", err.message);
      continue;
    }
    let tour = "";
    for (const rec of text.split("~")) {
      const z = field(rec, "ZA");
      if (z) tour = z;
      if (!TOUR_OK.test(tour)) continue;
      const home = field(rec, "AE");
      const away = field(rec, "AF");
      if (!home || !away) continue;
      const unix = Number(field(rec, "AD")) * 1000;
      if (!unix || unix < NOW - 3 * 60 * 1000 || unix > NOW + HORIZON) continue;
      const ab = field(rec, "AB");
      if (ab === "2" || ab === "3") continue;
      const H = findTeam(index, home);
      const A = findTeam(index, away);
      if (!H || !A || H.league !== A.league) continue;
      const key = `${norm(home)}|${norm(away)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const homeFav = H.pts >= A.pts;
      const fav = homeFav ? H : A;
      const dog = homeFav ? A : H;
      const gap = fav.pts - dog.pts;
      const games = Math.max(fav.gp || 1, dog.gp || 1);
      const gapPer = gap / games;
      if (gap < 8 || gapPer < 0.7) continue;
      if (fav.rank > 8 && gap < 12) continue;
      const homeBonus = homeFav ? 6 : -4;
      const wreck = dog.wins <= 2 ? 4 : 0;
      const score = gapPer * 10 + homeBonus + wreck + (fav.rank <= 3 ? 3 : 0);
      if (score < 12) continue;
      const why = homeFav
        ? `${fav.pts} очков против ${dog.pts}, дома`
        : `${fav.pts} очков против ${dog.pts}. Выезд`;
      ideas.push({
        t: unix,
        hm: mskParts(unix).hm,
        sport: "football",
        score,
        line: `${mskParts(unix).hm} ${home} — ${away}, ${homeFav ? "П1" : "П2"}. ${why}. ${H.league}`,
      });
    }
  }
  return ideas;
}

async function hockeyIdeas() {
  const stand = await getJson("https://api-web.nhle.com/v1/standings/now");
  const pts = {};
  for (const r of stand.standings || []) {
    const ab = r.teamAbbrev?.default;
    pts[ab] = { p: r.points, w: r.wins, l: r.losses, ot: r.otLosses, name: r.teamCommonName?.default || ab };
  }
  const ideas = [];
  const days = [0, 1].map((n) => {
    const d = new Date(NOW + n * 86400000);
    return d.toISOString().slice(0, 10);
  });
  for (const day of days) {
    const nhl = await getJson(`https://api-web.nhle.com/v1/schedule/${day}`);
    for (const d of nhl.gameWeek || []) {
      for (const g of d.games || []) {
        const t = Date.parse(g.startTimeUTC);
        if (!t || t < NOW - 8 * 60 * 1000 || t > NOW + HORIZON) continue;
        if (["FINAL", "OFF", "LIVE", "CRIT"].includes(g.gameState)) continue;
        const ha = g.homeTeam?.abbrev;
        const aa = g.awayTeam?.abbrev;
        const H = pts[ha];
        const A = pts[aa];
        if (!H || !A) continue;
        const homeFav = H.p >= A.p;
        const fav = homeFav ? H : A;
        const dog = homeFav ? A : H;
        const gap = fav.p - dog.p;
        if (gap < 8) continue;
        const score = gap + (homeFav ? 4 : -3) - 6;
        if (score < 6) continue;
        const home = g.homeTeam?.commonName?.default || H.name;
        const away = g.awayTeam?.commonName?.default || A.name;
        const why = homeFav
          ? `${H.p} очков против ${A.p}, дома`
          : `${A.p} очков против ${H.p}. Выезд`;
        ideas.push({
          t,
          hm: mskParts(t).hm,
          sport: "hockey",
          score,
          line: `${mskParts(t).hm} ${home} — ${away}, ${homeFav ? "П1" : "П2"}. ${why}`,
        });
      }
    }
  }
  return ideas;
}

function wl(summary) {
  const m = String(summary || "").match(/(\d+)-(\d+)/);
  if (!m) return null;
  return { w: Number(m[1]), l: Number(m[2]) };
}

async function nbaIdeas() {
  const ideas = [];
  const days = [0, 1].map((n) => {
    const d = new Date(NOW + n * 86400000);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  });
  for (const dates of days) {
    const body = await getJson(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dates}`);
    for (const ev of body.events || []) {
      const c = ev.competitions?.[0];
      const t = Date.parse(ev.date);
      if (!t || t < NOW - 15 * 60 * 1000 || t > NOW + HORIZON) continue;
      if (c?.status?.type?.state === "post" || c?.status?.type?.state === "in") continue;
      const h = c.competitors.find((x) => x.homeAway === "home");
      const a = c.competitors.find((x) => x.homeAway === "away");
      const rs = (s) => (s.records || []).find((r) => r.type === "total")?.summary || "";
      const H = wl(rs(h));
      const A = wl(rs(a));
      if (!H || !A) continue;
      const homeFav = H.w - H.l >= A.w - A.l;
      const fav = homeFav ? H : A;
      const dog = homeFav ? A : H;
      const winDiff = fav.w - dog.w;
      if (winDiff < 4 && !(dog.w <= 2 && fav.w >= 7)) continue;
      const score = winDiff * 2 + (homeFav ? 4 : -3) - 3;
      if (score < 6) continue;
      const home = h.team.shortDisplayName;
      const away = a.team.shortDisplayName;
      const why = homeFav
        ? `${H.w}–${H.l} против ${A.w}–${A.l}, дома`
        : `${A.w}–${A.l} против ${H.w}–${H.l}. Выезд`;
      ideas.push({
        t,
        hm: mskParts(t).hm,
        sport: "basketball",
        score,
        line: `${mskParts(t).hm} ${home} — ${away}, ${homeFav ? "П1" : "П2"}. ${why}`,
      });
    }
  }
  return ideas;
}

async function euroIdeas() {
  const el = await getJson("https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games");
  const list = Array.isArray(el) ? el : el.data || [];
  const rec = {};
  const add = (n, w) => {
    if (!n) return;
    rec[n] ??= { w: 0, l: 0 };
    rec[n][w ? "w" : "l"]++;
  };
  for (const g of list) {
    if (!g.played) continue;
    const hs = Number(g.local?.score);
    const as = Number(g.road?.score);
    if (!Number.isFinite(hs) || hs === as) continue;
    add(g.local?.club?.name, hs > as);
    add(g.road?.club?.name, as > hs);
  }
  const ideas = [];
  for (const g of list) {
    const t = Date.parse(g.utcDate || "");
    if (!t || t < NOW - 20 * 60 * 1000 || t > NOW + HORIZON || g.played) continue;
    const hn = g.local?.club?.name;
    const an = g.road?.club?.name;
    const H = rec[hn] || { w: 0, l: 0 };
    const A = rec[an] || { w: 0, l: 0 };
    const homeFav = H.w - H.l >= A.w - A.l;
    const fav = homeFav ? H : A;
    const dog = homeFav ? A : H;
    const winDiff = fav.w - dog.w;
    if (winDiff < 4) continue;
    const score = winDiff * 2 + (homeFav ? 4 : -3) - 2;
    if (score < 6) continue;
    const short = (n) => String(n || "").replace(/ (Basket|Basketball|Istanbul|Munich|Belgrade|Athens|Kaunas).*/i, "").split(" ").slice(0, 2).join(" ");
    const why = homeFav
      ? `${H.w}–${H.l} против ${A.w}–${A.l}, дома`
      : `${A.w}–${A.l} против ${H.w}–${H.l}. Выезд`;
    ideas.push({
      t,
      hm: mskParts(t).hm,
      sport: "basketball",
      score,
      line: `${mskParts(t).hm} ${short(hn)} — ${short(an)}, ${homeFav ? "П1" : "П2"}. Евролига. ${why}`,
    });
  }
  return ideas;
}

const ideas = [];
const errors = [];
for (const [name, fn] of [
  ["football", footballIdeas],
  ["hockey", hockeyIdeas],
  ["nba", nbaIdeas],
  ["euro", euroIdeas],
]) {
  try {
    ideas.push(...(await fn()));
  } catch (err) {
    errors.push(`${name}: ${err.message}`);
    console.error(name, err);
  }
}
ideas.sort((a, b) => b.score - a.score || a.t - b.t);
const top = ideas.slice(0, 8);
const date = moscowDate();
const hm = mskParts(NOW).hm;
const lines = [
  `# Лайнер, ${date}`,
  "",
  `${hm} по Москве. В Риге на час меньше. Собрано автоматически по таблицам, без тоталов и без ровной верхушки.`,
  "",
  "Рейтинг по шансу, что исход зайдёт, не по коэффициенту.",
  "",
];
if (!top.length) lines.push("Спокойных разрывов в ближайшие 18 часов нет.");
top.forEach((idea, i) => lines.push(`${i + 1}. ${idea.line}`));
if (errors.length) {
  lines.push("", "Не удалось прочитать: " + errors.join("; "));
}
lines.push("");
const body = lines.join("\n");
const { mkdir, writeFile } = await import("node:fs/promises");
await mkdir("docs/daily", { recursive: true });
const path = `docs/daily/${date}.md`;
await writeFile(path, body);
console.log(path);
console.log(body);
