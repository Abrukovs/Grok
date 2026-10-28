import { sportHitRates } from "./stats";
import { SPORT_META } from "./sports";
import type { JournalEntry, SavedIdea } from "./types";

export type JournalExportRow = {
  date: string;
  sport: string;
  match: string;
  tournament: string;
  outcome: string;
  result: string;
};

const VERDICT_RU: Record<JournalEntry["verdict"], string> = {
  hit: "зашло",
  miss: "не зашло",
  void: "возврат",
};

export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  const d = new Date(Date.UTC(y, m - 1, 12));
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

export function journalMonths(entries: JournalEntry[]): string[] {
  const seen = new Set<string>();
  for (const e of entries) {
    const k = monthKey(e.briefingDate || e.settledAt.slice(0, 10));
    if (/^\d{4}-\d{2}$/.test(k)) seen.add(k);
  }
  return [...seen].sort().reverse();
}

export function rowsForMonth(entries: JournalEntry[], month: string): JournalExportRow[] {
  return entries
    .filter((e) => monthKey(e.briefingDate || e.settledAt.slice(0, 10)) === month)
    .sort((a, b) => (a.briefingDate || a.settledAt).localeCompare(b.briefingDate || b.settledAt))
    .map((e) => ({
      date: formatDotDate(e.briefingDate || e.settledAt.slice(0, 10)),
      sport: SPORT_META[e.sport]?.label ?? e.sport,
      match: e.match,
      tournament: e.leagueShort || "—",
      outcome: `${e.market}: ${e.pick}`,
      result: VERDICT_RU[e.verdict],
    }));
}

function formatDotDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!d) return iso;
  return `${d}.${m}.${y}`;
}

const SAVED_RESULT: Record<string, string> = {
  hit: "зашло",
  miss: "не зашло",
  void: "возврат",
};

export function rowsFromSaved(ideas: SavedIdea[], month: string): JournalExportRow[] {
  return ideas
    .filter((idea) => idea.date.slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date) || a.match.localeCompare(b.match, "ru"))
    .map((idea) => ({
      date: formatDotDate(idea.date),
      sport: SPORT_META[idea.sport]?.label ?? idea.sport,
      match: idea.match,
      tournament: idea.league || "—",
      outcome: `${idea.market}: ${idea.pick}`,
      result: idea.verdict ? `${SAVED_RESULT[idea.verdict]}${idea.score ? ` ${idea.score}` : ""}` : "нет счёта",
    }));
}

export function plainSaved(ideas: SavedIdea[], month: string): string {
  const rows = rowsFromSaved(ideas, month);
  const lines = [
    `Лайнер · ${monthLabel(month)}`,
    "Дата, вид спорта, матч, турнир, исход, расчёт.",
    "",
  ];
  for (const row of rows) {
    lines.push(`${row.date} · ${row.sport} · ${row.match} · ${row.tournament} · ${row.outcome} · ${row.result}`);
  }
  lines.push("");
  return lines.join("\n");
}

function csvCell(value: string): string {
  if (/[",\n;]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function toCsv(rows: JournalExportRow[]): string {
  const header = ["дата", "вид спорта", "матч", "турнир", "предлагаемый исход", "зашло"];
  const lines = [
    header.join(";"),
    ...rows.map((r) =>
      [r.date, r.sport, r.match, r.tournament, r.outcome, r.result].map(csvCell).join(";"),
    ),
  ];
  return `\uFEFF${lines.join("\n")}\n`;
}

function sportSummary(entries: JournalEntry[], month: string): string {
  const slice = entries.filter(
    (e) => monthKey(e.briefingDate || e.settledAt.slice(0, 10)) === month,
  );
  const rates = sportHitRates(slice);
  if (!rates.length) return "";
  return rates
    .map((r) => `${r.label}: ${r.rate == null ? "—" : `${r.rate}%`} (${r.hits}/${r.hits + r.misses})`)
    .join("; ");
}

export function toMarkdown(entries: JournalEntry[], month: string, rows: JournalExportRow[]): string {
  const title = monthLabel(month);
  const summary = sportSummary(entries, month);
  const lines = [
    `# Лайнер · ${title}`,
    "",
    "Дата, вид спорта, матч, турнир, предлагаемый исход, зашло / не зашло.",
    "",
  ];
  if (summary) {
    lines.push(`По видам: ${summary}.`, "");
  }
  lines.push("| Дата | Спорт | Матч | Турнир | Исход | Результат |", "|---|---|---|---|---|---|");
  for (const r of rows) {
    lines.push(
      `| ${r.date} | ${r.sport} | ${r.match.replaceAll("|", "/")} | ${r.tournament} | ${r.outcome.replaceAll("|", "/")} | ${r.result} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function toPrintHtml(entries: JournalEntry[], month: string, rows: JournalExportRow[]): string {
  const title = `Лайнер · ${monthLabel(month)}`;
  const summary = sportSummary(entries, month);
  const trs = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.date)}</td><td>${esc(r.sport)}</td><td>${esc(r.match)}</td><td>${esc(r.tournament)}</td><td>${esc(r.outcome)}</td><td>${esc(r.result)}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font:14px/1.4 -apple-system,Segoe UI,sans-serif;color:#111;padding:24px}
  h1{font-size:18px;margin:0 0 8px}
  p{color:#444;margin:0 0 16px;font-size:13px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
  th{background:#f4f4f4}
</style></head><body>
<h1>${esc(title)}</h1>
<p>Дата, вид спорта, матч, турнир, предлагаемый исход, зашло / не зашло.${summary ? ` ${esc(summary)}.` : ""}</p>
<table><thead><tr><th>Дата</th><th>Спорт</th><th>Матч</th><th>Турнир</th><th>Исход</th><th>Результат</th></tr></thead><tbody>${trs}</tbody></table>
</body></html>`;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;");
}

export function downloadText(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function toPlain(entries: JournalEntry[], month: string): string {
  const rows = rowsForMonth(entries, month);
  const title = `Лайнер · ${monthLabel(month)}`;
  const summary = sportSummary(entries, month);
  const lines = [
    title,
    "Дата, вид спорта, матч, турнир, предлагаемый исход, зашло / не зашло.",
  ];
  if (summary) lines.push(`По видам: ${summary}.`);
  lines.push("");
  for (const r of rows) {
    lines.push(`${r.date} · ${r.sport} · ${r.match} · ${r.tournament} · ${r.outcome} · ${r.result}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function inFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export async function copyMonth(entries: JournalEntry[], month: string): Promise<boolean> {
  const text = toPlain(entries, month);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadMonth(entries: JournalEntry[], month: string, format: "csv" | "md" | "pdf" | "doc") {
  const rows = rowsForMonth(entries, month);
  const stamp = `lainer-${month}`;
  if (format === "csv") {
    downloadText(`${stamp}.csv`, "text/csv;charset=utf-8", toCsv(rows));
    return;
  }
  if (format === "md") {
    downloadText(`${stamp}.md`, "text/markdown;charset=utf-8", toMarkdown(entries, month, rows));
    return;
  }
  const html = toPrintHtml(entries, month, rows);
  if (format === "doc") {
    downloadText(`${stamp}.doc`, "application/msword;charset=utf-8", html);
    return;
  }
  downloadText(`${stamp}.html`, "text/html;charset=utf-8", html);
  if (inFrame()) return;
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => w.print();
}

