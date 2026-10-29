import type { AnalystReply, MatchEvent, Risk, Tip } from "./types";

const SYSTEM = `Ты аналитик спортивных линий в приложении «Лайнер».
Пиши по-русски, коротко, спокойным тоном.
Это идеи для самостоятельной оценки, не рекомендация ставить и не финансовый совет.
Запрещены слова: гарант, 100%, ставьте, заносите, капперский проход, железобетон.
Не обещай прибыль. Если данных мало — так и скажи.
Если спрашивают «разбор дня» — выдели 2–3 самых чистых гипотезы из брифа и одну, которую лучше пропустить.
Отвечай 2–6 предложений, без списков из эмодзи.`;

export async function askGrok(input: {
  message: string;
  tips: Tip[];
}): Promise<AnalystReply> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      text: "Аналитик сейчас недоступен. Можете опереться на бриф по форме — это уже гипотезы, не совет.",
    };
  }

  const context = input.tips.slice(0, 8).map((t) => ({
    match: `${t.away.short} @ ${t.home.short}`,
    league: t.league,
    market: t.market,
    pick: t.pick,
    kickoff: t.kickoff,
    rationale: t.rationale,
  }));

  const body = {
    model: "grok-4.5",
    temperature: 0.4,
    max_tokens: 700,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Контекст сегодняшнего брифа (JSON):\n${JSON.stringify(context)}\n\nВопрос пользователя:\n${input.message.slice(0, 500)}`,
      },
    ],
  };

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    return {
      text: "Не удалось получить разбор. Попробуйте ещё раз чуть позже — бриф по форме остаётся на экране.",
    };
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  return {
    text:
      text ||
      "Пустой ответ аналитика. Смотрите карточки брифа — там уже есть рабочие гипотезы.",
  };
}

export type AuthoredDraft = {
  eventId: string;
  market: string;
  pick: string;
  oddsHint: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  risk: Risk;
  rationale: string;
};

const COMPOSE_SYSTEM = `Ты составляешь ежедневный бриф «Лайнер» — короткий список рабочих гипотез по футболу и другим видам из календаря.
Пиши по-русски. Это идеи для самостоятельной оценки, не совет ставить.
Запрещены: гарант, 100%, ставьте, заносите, железобетон, каппер.
Верни ТОЛЬКО JSON-массив из 6–8 объектов, без markdown:
{"eventId":"...","market":"Исход|Фора|Тотал|Обе забьют|Победитель","pick":"...","oddsHint":"~1.70–2.00","confidence":1-5,"risk":"low|medium|high","rationale":"1–2 конкретных предложения"}
Правила:
- eventId строго из списка матчей, матчи не выдумывай.
- Сначала самые чистые гипотезы (класс + форма), слабые в конец или выкинь.
- pick: для исхода П1/П2; для форы «Команда −1.5»; для тотала «ТБ 2.5» или «ТМ 2.5»; для тенниса имя игрока.
- rationale опирается на форму/рекорд/дом/класс из данных. Без воды.
- Не больше одной идеи на матч.
- Футбол важнее тенниса.`;

let composeCache: { key: string; drafts: AuthoredDraft[]; at: number } | null = null;

function extractArray(text: string): unknown[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asDraft(row: unknown, allowed: Set<string>): AuthoredDraft | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const eventId = String(r.eventId ?? "");
  if (!allowed.has(eventId)) return null;
  const market = String(r.market ?? "").trim().slice(0, 40);
  const pick = String(r.pick ?? "").trim().slice(0, 60);
  const rationale = String(r.rationale ?? "").trim().slice(0, 420);
  if (!market || !pick || rationale.length < 24) return null;
  const riskRaw = String(r.risk ?? "medium");
  const risk: Risk = riskRaw === "low" || riskRaw === "high" ? riskRaw : "medium";
  const conf = Number(r.confidence);
  const confidence = (Number.isFinite(conf)
    ? Math.max(1, Math.min(5, Math.round(conf)))
    : 3) as 1 | 2 | 3 | 4 | 5;
  return {
    eventId,
    market,
    pick,
    oddsHint: String(r.oddsHint ?? "~1.80–2.05").slice(0, 24),
    confidence,
    risk,
    rationale,
  };
}

export async function composeBriefing(events: MatchEvent[]): Promise<AuthoredDraft[]> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return [];
  const upcoming = [...events]
    .filter((e) => e.state === "pre")
    .sort((a, b) => {
      const as = a.sport === "football" ? 0 : 1;
      const bs = b.sport === "football" ? 0 : 1;
      if (as !== bs) return as - bs;
      return Date.parse(a.date) - Date.parse(b.date);
    })
    .slice(0, 18);
  if (!upcoming.length) return [];

  const key = upcoming.map((e) => e.id).join("|");
  if (composeCache && composeCache.key === key && Date.now() - composeCache.at < 3 * 60 * 60 * 1000) {
    return composeCache.drafts;
  }

  const payload = upcoming.map((e) => ({
    eventId: e.id,
    sport: e.sport,
    league: e.leagueShort,
    home: e.home.name,
    away: e.away.name,
    homeShort: e.home.short,
    awayShort: e.away.short,
    homeForm: e.home.form ?? "",
    awayForm: e.away.form ?? "",
    homeRecord: e.home.record ?? "",
    awayRecord: e.away.record ?? "",
    kickoff: e.date,
  }));

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.35,
        max_tokens: 1600,
        messages: [
          { role: "system", content: COMPOSE_SYSTEM },
          {
            role: "user",
            content: `Матчи (JSON). Составь бриф на сегодня/ближайшие дни:\n${JSON.stringify(payload)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    const allowed = new Set(upcoming.map((e) => e.id));
    const drafts = extractArray(text)
      .map((row) => asDraft(row, allowed))
      .filter((d): d is AuthoredDraft => Boolean(d));
    const unique: AuthoredDraft[] = [];
    const used = new Set<string>();
    for (const d of drafts) {
      if (used.has(d.eventId)) continue;
      used.add(d.eventId);
      unique.push(d);
      if (unique.length >= 8) break;
    }
    if (unique.length >= 3) composeCache = { key, drafts: unique, at: Date.now() };
    return unique;
  } catch {
    return [];
  }
}

export type MissRow = {
  tipId: string;
  match: string;
  market: string;
  pick: string;
  score?: string;
  rationale?: string;
  leagueShort?: string;
};

export type MissReview = {
  summary: string;
  notes: { tipId: string; note: string }[];
};

function extractObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function localMissReview(misses: MissRow[]): MissReview {
  const notes = misses.map((m) => ({
    tipId: m.tipId,
    note: m.score
      ? `Счёт ${m.score} не подтвердил линию «${m.pick}».`
      : `Линия «${m.pick}» не сыграла.`,
  }));
  const summary =
    misses.length === 1
      ? "Один промах за сутки: счёт разошёлся с исходной гипотезой."
      : `${misses.length} промахов за сутки. Счёт не совпал с линией брифа.`;
  return { summary, notes };
}

export async function explainMissesGrok(misses: MissRow[]): Promise<MissReview> {
  const fallback = localMissReview(misses);
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || !misses.length) return fallback;

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.3,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content: `Ты аналитик «Лайнера». Разбираешь, почему идея брифа не зашла.
Пиши по-русски, спокойно, вкратце. Это не совет ставить и не разбор кассы.
Запрещены: гарант, ставьте, железобетон, каппер.
Верни ТОЛЬКО JSON:
{"summary":"1–2 предложения по дню","notes":[{"tipId":"...","note":"одно короткое предложение, почему линия не сыграла"}]}
Правила note: сверь исходную гипотезу со счётом. Без воды, без «надо было ставить иначе».`,
          },
          {
            role: "user",
            content: `Промахи за сутки (JSON):\n${JSON.stringify(misses)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return fallback;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = extractObject(json.choices?.[0]?.message?.content ?? "");
    if (!parsed) return fallback;
    const allowed = new Set(misses.map((m) => m.tipId));
    const rawNotes = Array.isArray(parsed.notes) ? parsed.notes : [];
    const notes: { tipId: string; note: string }[] = [];
    for (const row of rawNotes) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const tipId = String(r.tipId ?? "");
      const note = String(r.note ?? "").trim().slice(0, 280);
      if (!allowed.has(tipId) || note.length < 12) continue;
      notes.push({ tipId, note });
    }
    if (!notes.length) return fallback;
    const summary = String(parsed.summary ?? "").trim().slice(0, 320) || fallback.summary;
    return { summary, notes };
  } catch {
    return fallback;
  }
}

