import { moscowDayKey } from "@/lib/format";
import type { JournalEntry, JournalVerdict, MatchEvent, Settlement, SlimTip } from "./types";

function closeEnough(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) < 36 * 60 * 60 * 1000;
}

function parseScore(raw?: string): number | null {
  if (raw == null || raw === "" || raw === "-" || raw === "–") return null;
  const n = Number.parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const ALIAS: [string, string][] = [
  ["дания", "denmark"],
  ["португал", "portugal"],
  ["бельг", "belgium"],
  ["турц", "turkey"],
  ["франц", "france"],
  ["итал", "italy"],
  ["испан", "spain"],
  ["чех", "czech"],
  ["хорват", "croatia"],
  ["англи", "england"],
  ["нидерланд", "netherlands"],
  ["серби", "serbia"],
  ["норвег", "norway"],
  ["грец", "greece"],
  ["герман", "germany"],
  ["черногор", "montenegro"],
  ["армен", "armenia"],
  ["румын", "romania"],
  ["швец", "sweden"],
  ["эйсез", "aces"],
  ["фивер", "fever"],
  ["уингз", "wings"],
  ["валькир", "valkyries"],
  ["мистикс", "mystics"],
  ["дрим", "dream"],
  ["либерти", "liberty"],
  ["виртус", "virtus"],
  ["баскон", "baskonia"],
  ["бешикташ", "besiktas"],
  ["бавар", "bayern"],
  ["жальгирис", "zalgiris"],
  ["эфес", "efes"],
  ["црвена", "crvena"],
  ["панатинаикос", "panathinaikos"],
  ["хапоэль", "hapoel"],
  ["олимпиакос", "olympiacos"],
  ["барселон", "barcelona"],
  ["арсенал", "arsenal"],
  ["лилль", "lille"],
  ["интер", "inter"],
  ["атлетико", "atletico"],
  ["атлетико", "atl. madrid"],
  ["манчестер юн", "manchester united"],
  ["манчестер юн", "manchester utd"],
  ["манчестер юн", "man utd"],
  ["реал", "real madrid"],
  ["вильярреал", "villarreal"],
  ["монако", "monaco"],
  ["псж", "psg"],
  ["наполи", "napoli"],
  ["фрозиноне", "frosinone"],
  ["рубин", "rubin"],
  ["динамо", "dynamo"],
  ["бетис", "betis"],
  ["осасуна", "osasuna"],
  ["марсель", "marseille"],
  ["депортиво", "deportivo"],
  ["леванте", "levante"],
  ["сассуоло", "sassuolo"],
  ["локомотив", "lokomotiv"],
  ["краснодар", "krasnodar"],
  ["ньюкасл", "newcastle"],
  ["зенит", "zenit"],
  ["ахмат", "akhmat"],
  ["брайтон", "brighton"],
  ["кристал", "crystal palace"],
  ["цска", "cska"],
  ["спартак", "spartak"],
  ["милан", "milan"],
  ["аталант", "atalanta"],
  ["ноттингем", "nottingham"],
  ["бразил", "brazil"],
  ["аргентин", "argentina"],
  ["qinwen", "zheng q"],
  ["yibing", "wu y"],
];

function expand(raw: string): string[] {
  const x = raw
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ");
  if (!x) return [];
  const out = new Set([x]);
  for (const [ru, en] of ALIAS) {
    if (x.includes(ru) || x.includes(en)) {
      out.add(ru);
      out.add(en);
    }
  }
  return [...out];
}

function sameName(a: string, b: string): boolean {
  const left = expand(a);
  const right = expand(b);
  return left.some((x) => right.some((y) => x === y || x.includes(y) || y.includes(x)));
}

export function findEvent(tip: SlimTip, events: MatchEvent[]): MatchEvent | undefined {
  const direct = events.find((e) => tip.eventId && e.id === tip.eventId);
  if (direct && direct.state === "post") return direct;
  const day = moscowDayKey(tip.kickoff);
  const pool = events.filter((e) => {
    if (e.sport !== tip.sport) return false;
    return moscowDayKey(e.date) === day || closeEnough(e.date, tip.kickoff);
  });
  const straight = pool.find((e) => sidesMatch(e, tip, false));
  if (straight) return straight;
  const flipped = pool.find((e) => sidesMatch(e, tip, true));
  return flipped ? swapSides(flipped) : undefined;
}

function sideHit(eventSide: { name: string; short: string }, tipSide: { name: string; short: string }): boolean {
  return (
    sameName(eventSide.short, tipSide.short) ||
    sameName(eventSide.name, tipSide.name) ||
    sameName(eventSide.short, tipSide.name) ||
    sameName(eventSide.name, tipSide.short)
  );
}

function sidesMatch(event: MatchEvent, tip: SlimTip, flip: boolean): boolean {
  const blob = `${event.home.name} ${event.away.name} ${event.name}`;
  const tipBlob = `${tip.home.name} ${tip.away.name}`;
  if (/u19|u21|u23|u20|women/i.test(blob) && !/u19|u21|u23|u20|women/i.test(tipBlob)) return false;
  const home = flip ? event.away : event.home;
  const away = flip ? event.home : event.away;
  return sideHit(home, tip.home) && sideHit(away, tip.away);
}

function swapSides(event: MatchEvent): MatchEvent {
  return {
    ...event,
    id: `${event.id}-swap`,
    home: event.away,
    away: event.home,
    homeScore: event.awayScore,
    awayScore: event.homeScore,
    winner: event.winner === "home" ? "away" : event.winner === "away" ? "home" : event.winner,
  };
}

export function evaluateTip(tip: SlimTip, event: MatchEvent): JournalVerdict | null {
  if (event.state !== "post") return null;
  const hs = parseScore(event.homeScore);
  const as = parseScore(event.awayScore);
  const market = tip.market;
  const pick = tip.pick.trim();

  if (market === "Исход") {
    if (hs == null || as == null) return null;
    if (pick === "П1") return hs > as ? "hit" : "miss";
    if (pick === "П2") return as > hs ? "hit" : "miss";
    if (pick === "X" || pick === "Х") return hs === as ? "hit" : "miss";
    return null;
  }

  if (market === "Победитель") {
    const pickHome = sameName(pick, event.home.short) || sameName(pick, event.home.name) || sameName(pick, tip.home.short);
    const pickAway = sameName(pick, event.away.short) || sameName(pick, event.away.name) || sameName(pick, tip.away.short);
    if (hs != null && as != null && hs !== as) {
      if (pickHome) return hs > as ? "hit" : "miss";
      if (pickAway) return as > hs ? "hit" : "miss";
    }
    if (event.winner === "home") return pickHome ? "hit" : pickAway ? "miss" : null;
    if (event.winner === "away") return pickAway ? "hit" : pickHome ? "miss" : null;
    return null;
  }

  if (market === "Двойной шанс") {
    if (hs == null || as == null) return null;
    const p = pick.toUpperCase().replaceAll("Х", "X");
    if (p === "1X") return hs >= as ? "hit" : "miss";
    if (p === "X2") return as >= hs ? "hit" : "miss";
    if (p === "12") return hs !== as ? "hit" : "miss";
    return null;
  }

  if (market === "Обе забьют") {
    if (hs == null || as == null) return null;
    const both = hs > 0 && as > 0;
    if (pick === "Да") return both ? "hit" : "miss";
    if (pick === "Нет") return both ? "miss" : "hit";
    return null;
  }

  if (market === "Тотал") {
    if (hs == null || as == null) return null;
    const m = pick.match(/Т([БМ])\s*(\d+(?:[.,]\d+)?)/i);
    if (!m) return null;
    const line = Number.parseFloat(m[2].replace(",", "."));
    const total = hs + as;
    if (total === line) return "void";
    const over = total > line;
    return m[1].toUpperCase() === "Б" ? (over ? "hit" : "miss") : over ? "miss" : "hit";
  }

  if (market === "Фора") {
    if (hs == null || as == null) return null;
    const m = pick.match(/^(.*)\s+([+\\u2212\\u2013-])(\d+(?:[.,]\d+)?)$/);
    if (!m) return null;
    const name = m[1].trim();
    const sign = m[2] === "+" ? 1 : -1;
    const line = sign * Number.parseFloat(m[3].replace(",", "."));
    const isHome =
      sameName(name, tip.home.short) ||
      sameName(name, event.home.short) ||
      sameName(name, tip.home.name);
    const isAway =
      sameName(name, tip.away.short) ||
      sameName(name, event.away.short) ||
      sameName(name, tip.away.name);
    if (!isHome && !isAway) return null;
    const margin = isHome ? hs - as : as - hs;
    const adj = margin + line;
    if (adj === 0) return "void";
    return adj > 0 ? "hit" : "miss";
  }

  return null;
}

export function settleTips(tips: SlimTip[], events: MatchEvent[]): Settlement[] {
  const out: Settlement[] = [];
  for (const tip of tips) {
    const event = findEvent(tip, events);
    if (!event) continue;
    const verdict = evaluateTip(tip, event);
    if (!verdict) continue;
    const hs = event.homeScore ?? "–";
    const as = event.awayScore ?? "–";
    out.push({
      tipId: tip.id,
      briefingDate: tip.briefingDate,
      match: `${tip.home.short} — ${tip.away.short}`,
      market: tip.market,
      pick: tip.pick,
      sport: tip.sport,
      leagueShort: tip.leagueShort,
      verdict,
      score: `${hs}:${as}`,
      rationale: tip.rationale,
      oddsHint: tip.oddsHint,
      confidence: tip.confidence,
      risk: tip.risk,
    });
  }
  return out;
}

function splitScore(score?: string): { home: number; away: number } | null {
  if (!score) return null;
  const m = score.match(/(\d+(?:[.,]\d+)?)\s*[:\\-–]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const home = Number.parseFloat(m[1].replace(",", "."));
  const away = Number.parseFloat(m[2].replace(",", "."));
  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away };
}

function sides(match: string): { home: string; away: string } {
  const parts = match.split(/\s+[—–-]\s+/);
  return { home: parts[0]?.trim() ?? match, away: parts[1]?.trim() ?? "" };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

export type PlayedAnalysis = {
  verdictLabel: string;
  why: string;
  thesis?: string;
  takeaway: string;
};

export function explainPlayed(entry: JournalEntry): PlayedAnalysis {
  const scores = splitScore(entry.score);
  const { home, away } = sides(entry.match);
  const pick = entry.pick.trim();
  const thesis = entry.rationale?.trim() || undefined;

  const verdictLabel =
    entry.verdict === "hit" ? "Зашла" : entry.verdict === "miss" ? "Мимо" : "Возврат";

  const takeaway =
    entry.verdict === "hit"
      ? "Гипотеза совпала со счётом. Это разбор идеи, не касса и не совет ставить."
      : entry.verdict === "miss"
        ? "Счёт пошёл против линии. Журнал копит и такие дни — без драмы."
        : "Линия села ровно. В плюс и в минус это не считается.";

  if (!scores) {
    return {
      verdictLabel,
      why: `Итог записан как «${verdictLabel.toLowerCase()}», но точный счёт в журнал не попал. Идея была: ${entry.market} · ${pick}.`,
      thesis,
      takeaway,
    };
  }

  const { home: hs, away: as } = scores;
  const total = hs + as;
  const winner = hs > as ? home : as > hs ? away : null;

  if (entry.market === "Исход") {
    const fact =
      winner == null
        ? `Ничья ${fmt(hs)}:${fmt(as)}.`
        : `${winner} выиграл ${fmt(hs)}:${fmt(as)}.`;
    if (pick === "П1") {
      return {
        verdictLabel,
        why: `${fact} Нужны были хозяева. ${hs > as ? "П1 совпал." : "П1 не совпал."}`,
        thesis,
        takeaway,
      };
    }
    if (pick === "П2") {
      return {
        verdictLabel,
        why: `${fact} Нужны были гости. ${as > hs ? "П2 совпал." : "П2 не совпал."}`,
        thesis,
        takeaway,
      };
    }
    if (pick === "X" || pick === "Х") {
      return {
        verdictLabel,
        why: `${fact} Нужна была ничья. ${hs === as ? "X совпал." : "X не совпал."}`,
        thesis,
        takeaway,
      };
    }
  }

  if (entry.market === "Победитель") {
    return {
      verdictLabel,
      why:
        winner == null
          ? `Счёт ${fmt(hs)}:${fmt(as)} — без победителя. Идея «${pick}» не закрылась через победу.`
          : `Победил ${winner} (${fmt(hs)}:${fmt(as)}). ${sameName(pick, winner) ? "Это и была идея." : `Идея была на ${pick}.`}`,
      thesis,
      takeaway,
    };
  }

  if (entry.market === "Обе забьют") {
    const both = hs > 0 && as > 0;
    return {
      verdictLabel,
      why: both
        ? `Обе команды забили (${fmt(hs)}:${fmt(as)}). Рынок «${pick}» ${pick === "Да" ? "совпал" : "не совпал"}.`
        : `Сухой счёт ${fmt(hs)}:${fmt(as)} — не обе забили. Рынок «${pick}» ${pick === "Нет" ? "совпал" : "не совпал"}.`,
      thesis,
      takeaway,
    };
  }

  if (entry.market === "Тотал") {
    const m = pick.match(/Т([БМ])\s*(\d+(?:[.,]\d+)?)/i);
    if (m) {
      const over = m[1].toUpperCase() === "Б";
      const line = Number.parseFloat(m[2].replace(",", "."));
      const delta = total - line;
      const abs = Math.abs(delta);
      let why = `В матче ${fmt(total)} — линия ${fmt(line)}. `;
      if (delta === 0) why += "Ровно на линии — возврат.";
      else if (over) why += delta > 0 ? `Тотал пробит, запас ${fmt(abs)}.` : `Тотал не пробит, не хватило ${fmt(abs)}.`;
      else why += delta < 0 ? `Низ прошёл, запас ${fmt(abs)}.` : `Низ не прошёл: голов больше линии на ${fmt(abs)}.`;
      return { verdictLabel, why, thesis, takeaway };
    }
  }

  if (entry.market === "Фора") {
    const m = pick.match(/^(.*)\s+([+\\u2212\\u2013-])(\d+(?:[.,]\d+)?)$/);
    if (m) {
      const name = m[1].trim();
      const sign = m[2] === "+" ? 1 : -1;
      const line = sign * Number.parseFloat(m[3].replace(",", "."));
      const isHome = sameName(name, home);
      const margin = isHome ? hs - as : as - hs;
      const adj = margin + line;
      const abs = Math.abs(adj);
      let why = `Счёт ${fmt(hs)}:${fmt(as)}, разница ${margin > 0 ? "+" : ""}${fmt(margin)}. Фора ${pick}. `;
      if (adj === 0) why += "После форы ровно ноль — возврат.";
      else if (adj > 0) why += `Фора закрылась, запас ${fmt(abs)}.`;
      else why += `Форы не хватило на ${fmt(abs)}.`;
      return { verdictLabel, why, thesis, takeaway };
    }
  }

  return {
    verdictLabel,
    why: `Счёт ${fmt(hs)}:${fmt(as)}. Идея: ${entry.market} · ${pick}.`,
    thesis,
    takeaway,
  };
}