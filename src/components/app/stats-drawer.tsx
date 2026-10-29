import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Drawer } from "vaul";
import { explainMisses } from "@/lib/briefing/actions";
import { buildDaily, journalSummary, sportHitRates } from "@/lib/briefing/stats";
import { copyMonth, downloadMonth, journalMonths, monthLabel, plainSaved, toPlain } from "@/lib/briefing/export-journal";
import { RISK_LABEL, SPORT_META } from "@/lib/briefing/sports";
import { AI_DAILY_CAP, useLinerStore } from "@/lib/briefing/store";
import { thesisFor } from "@/lib/briefing/thesis";
import type { BriefingStats, IdeaSnapshot, JournalEntry, SavedIdea, SlimTip, Sport } from "@/lib/briefing/types";
import { formatLongDate, formatShortDay, moscowDayKey, moscowShift, todayMoscow } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats?: BriefingStats;
  journal: JournalEntry[];
  archive: SlimTip[];
  theses?: IdeaSnapshot[];
  savedIdeas?: SavedIdea[];
};

export function StatsDrawer({
  open,
  onOpenChange,
  stats,
  journal,
  archive,
  theses = [],
  savedIdeas = [],
}: Props) {
  const [opened, setOpened] = useState<JournalEntry | null>(null);
  const [sport, setSport] = useState<"all" | Sport>("all");
  const months = useMemo(() => {
    const keys = new Set(journalMonths(journal));
    for (const idea of savedIdeas) {
      const key = idea.date.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(key)) keys.add(key);
    }
    return [...keys].sort().reverse();
  }, [journal, savedIdeas]);
  const [month, setMonth] = useState<string>("");
  const [email, setEmail] = useState("");
  const [letter, setLetter] = useState<string | null>(null);
  const [archiveDay, setArchiveDay] = useState<string | null>(null);
  const activeMonth = month && months.includes(month) ? month : months[0] ?? "";
  const savedDays = useMemo(() => {
    const map = new Map<string, SavedIdea[]>();
    for (const idea of savedIdeas) {
      const list = map.get(idea.date) ?? [];
      list.push(idea);
      map.set(idea.date, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [savedIdeas]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("liner-stats-email");
      if (saved) setEmail(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const sportsInJournal = useMemo(() => {
    const seen = new Set<Sport>();
    for (const entry of journal) seen.add(entry.sport);
    return [...seen].sort((a, b) =>
      (SPORT_META[a]?.label ?? a).localeCompare(SPORT_META[b]?.label ?? b, "ru"),
    );
  }, [journal]);

  const visible = useMemo(
    () => (sport === "all" ? journal : journal.filter((entry) => entry.sport === sport)),
    [journal, sport],
  );
  const pending = useMemo(
    () => (sport === "all" ? archive : archive.filter((tip) => tip.sport === sport)),
    [archive, sport],
  );
  const lastDayMisses = useMemo(() => {
    const today = todayMoscow();
    const yday = moscowShift(-1);
    return visible.filter((entry) => {
      if (entry.verdict !== "miss") return false;
      const day = entry.briefingDate || moscowDayKey(entry.settledAt);
      return day === today || day === yday;
    });
  }, [visible]);
  const summary = journalSummary(visible);
  const sportRates = useMemo(() => sportHitRates(journal), [journal]);
  const daily = buildDaily(visible, pending);
  const riskMax = Math.max(1, ...(stats?.byRisk.map((r) => r.count) ?? [1]));
  const sportMax = Math.max(1, ...(stats?.bySport.map((s) => s.count) ?? [1]));
  const saveMissNotes = useLinerStore((s) => s.saveMissNotes);
  const bumpAiUsage = useLinerStore((s) => s.bumpAiUsage);
  const [review, setReview] = useState<string | null>(null);

  const missMutation = useMutation({
    mutationFn: () =>
      explainMisses({
        data: {
          misses: lastDayMisses.slice(0, 8).map((e) => ({
            tipId: e.tipId,
            match: e.match,
            market: e.market,
            pick: e.pick,
            score: e.score,
            rationale: e.rationale,
            leagueShort: e.leagueShort,
          })),
        },
      }),
    onSuccess: (res) => {
      saveMissNotes(res.notes);
      setReview(res.summary);
      toast(res.notes.length ? "Причины записаны в журнал" : "Промахов за сутки нет");
    },
    onError: () => {
      toast("Не удалось разобрать промахи");
    },
  });

  function runMissReview() {
    if (!lastDayMisses.length) {
      toast("За последние сутки промахов нет");
      return;
    }
    if (!bumpAiUsage(todayMoscow())) {
      toast(`Лимит разборов на сегодня: ${AI_DAILY_CAP}`);
      return;
    }
    missMutation.mutate();
  }

  useEffect(() => {
    if (!open) setOpened(null);
  }, [open]);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
      noBodyStyles
      shouldScaleBackground={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-bg/70" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] max-w-lg flex-col rounded-t-3xl bg-surface shadow-[var(--shadow-border)]">
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border" />
          {opened ? (
            <PlayedView entry={opened} theses={theses} onBack={() => setOpened(null)} />
          ) : (
            <>
              <Drawer.Title className="font-display px-5 py-4 text-lg font-medium">
                Статистика
              </Drawer.Title>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-8">
                {savedDays.length ? (
                  <section>
                    <p className="mb-1 font-mono text-2xs tracking-widest text-muted uppercase">
                      архив идей · {savedIdeas.length}
                    </p>
                    <p className="mb-3 text-2xs leading-relaxed text-subtle">
                      Расчёт по счёту пишется сам. Нажмите дату. «Скопировать» ниже — весь месяц уже с зашло / не зашло.
                    </p>
                    <ul className="space-y-1">
                      {savedDays.map(([date, rows]) => {
                        const openDay = archiveDay === date;
                        return (
                          <li key={date}>
                            <button
                              type="button"
                              onClick={() => setArchiveDay(openDay ? null : date)}
                              className="flex h-10 w-full items-center justify-between rounded-md bg-surface-2 px-3 text-sm text-fg"
                            >
                              <span>{formatLongDate(date)}</span>
                              <span className="font-mono text-xs text-muted">{rows.length}</span>
                            </button>
                            {openDay ? (
                              <ul className="mt-1 space-y-1 px-1">
                                {rows.map((idea, i) => (
                                  <li key={`${idea.match}-${idea.pick}-${i}`} className="text-xs leading-relaxed text-fg">
                                    <span className="text-muted">
                                      {SPORT_META[idea.sport]?.label ?? idea.sport}
                                      {" · "}
                                    </span>
                                    {idea.match}
                                    {" · "}
                                    {idea.pick}
                                    {idea.score ? ` · ${idea.score}` : ""}
                                    {idea.verdict === "hit"
                                      ? " · зашло"
                                      : idea.verdict === "miss"
                                        ? " · мимо"
                                        : idea.verdict === "void"
                                          ? " · возврат"
                                          : " · ждёт"}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}
                {stats ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Kpi value={String(stats.upcomingCount)} label="в календаре" />
                      <Kpi value={String(stats.tipCount)} label="сегодня" />
                      <Kpi
                        value={stats.avgConfidence ? stats.avgConfidence.toFixed(1) : "—"}
                        label="оценка"
                      />
                    </div>

                    <section>
                      <p className="mb-3 font-mono text-2xs tracking-widest text-muted uppercase">
                        линия брифа
                      </p>
                      <ul className="space-y-2">
                        {stats.byRisk.map((row) => (
                          <li key={row.key} className="flex items-center gap-3">
                            <span className="w-20 shrink-0 text-xs text-muted">{row.label}</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  row.key === "low" && "bg-ok",
                                  row.key === "medium" && "bg-accent",
                                  row.key === "high" && "bg-live",
                                )}
                                style={{ width: `${(row.count / riskMax) * 100}%` }}
                              />
                            </div>
                            <span className="font-mono w-4 text-right text-xs tabular-nums text-fg">
                              {row.count}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    {stats.bySport.length ? (
                      <section>
                        <p className="mb-3 font-mono text-2xs tracking-widest text-muted uppercase">
                          в сегодняшнем брифе
                        </p>
                        <ul className="space-y-2">
                          {stats.bySport.map((row) => (
                            <li key={row.key} className="flex items-center gap-3">
                              <span className="w-24 shrink-0 truncate text-xs text-muted">
                                {row.label}
                              </span>
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                                <div
                                  className="h-full rounded-full bg-accent"
                                  style={{ width: `${(row.count / sportMax) * 100}%` }}
                                />
                              </div>
                              <span className="font-mono w-4 text-right text-xs tabular-nums text-fg">
                                {row.count}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}

                    {stats.byMarket.length ? (
                      <section>
                        <p className="mb-3 font-mono text-2xs tracking-widest text-muted uppercase">
                          рынки
                        </p>
                        <ul className="space-y-1.5">
                          {stats.byMarket.map((m) => (
                            <li
                              key={m.label}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-fg">{m.label}</span>
                              <span className="font-mono tabular-nums text-muted">{m.count}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted">Бриф ещё не собран.</p>
                )}

                <section>
                  <p className="mb-3 font-mono text-2xs tracking-widest text-muted uppercase">
                    журнал · {visible.length}
                    {sport !== "all" ? ` из ${journal.length}` : ""}
                  </p>
                  {sportsInJournal.length > 1 ? (
                    <div className="mb-3 flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <FilterChip
                        active={sport === "all"}
                        onClick={() => setSport("all")}
                      >
                        все
                      </FilterChip>
                      {sportsInJournal.map((key) => (
                        <FilterChip
                          key={key}
                          active={sport === key}
                          onClick={() => setSport(key)}
                        >
                          {SPORT_META[key]?.label ?? key}
                        </FilterChip>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2">
                    <Kpi value={summary.rate == null ? "—" : `${summary.rate}%`} label="зашло" />
                    <Kpi value={String(summary.hits)} label="да" />
                    <Kpi value={String(summary.misses)} label="мимо" />
                  </div>
                  {sportRates.length ? (
                    <section className="mt-4">
                      <p className="mb-3 font-mono text-2xs tracking-widest text-muted uppercase">
                        какой вид удачнее
                      </p>
                      <ul className="space-y-2">
                        {sportRates.map((row, i) => (
                          <li key={row.key} className="flex items-center gap-3">
                            <span className="w-24 shrink-0 truncate text-xs text-muted">
                              {row.label}
                            </span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  i === 0 && row.rate != null ? "bg-ok" : "bg-accent",
                                )}
                                style={{ width: `${row.rate ?? 0}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                "font-mono w-10 text-right text-xs tabular-nums",
                                i === 0 && row.rate != null ? "text-ok" : "text-fg",
                              )}
                            >
                              {row.rate == null ? "—" : `${row.rate}%`}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-2xs text-subtle">
                        По закрытым идеям журнала. Мало решений — процент ещё шумит.
                      </p>
                    </section>
                  ) : null}
                  {months.length ? (
                    <section className="mt-4">
                      <p className="mb-3 font-mono text-2xs tracking-widest text-muted uppercase">
                        месяц
                      </p>
                      {months.length > 1 ? (
                        <div className="mb-3 flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {months.map((key) => (
                            <FilterChip
                              key={key}
                              active={activeMonth === key}
                              onClick={() => setMonth(key)}
                            >
                              {monthLabel(key)}
                            </FilterChip>
                          ))}
                        </div>
                      ) : (
                        <p className="mb-3 text-xs text-muted">{monthLabel(activeMonth)}</p>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const text = savedIdeas.length
                              ? plainSaved(savedIdeas, activeMonth)
                              : toPlain(journal, activeMonth);
                            const n = text.split("\n").filter((line) => line.includes("·")).length;
                            setLetter(text);
                            if (savedIdeas.length) {
                              try {
                                await navigator.clipboard.writeText(text);
                                toast(`Месяц с расчётом: ${n}`);
                              } catch {
                                toast("Выделите текст ниже — там весь месяц");
                              }
                              return;
                            }
                            const ok = await copyMonth(journal, activeMonth);
                            toast(ok ? `Скопирован весь месяц: ${n}` : "Выделите текст ниже — там весь месяц");
                          }}
                          className="h-11 rounded-md bg-accent text-xs font-medium text-accent-fg"
                        >
                          Скопировать
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const addr = email.trim();
                            if (!addr || !addr.includes("@")) {
                              toast("Укажите почту");
                              return;
                            }
                            try {
                              localStorage.setItem("liner-stats-email", addr);
                            } catch {
                              /* ignore */
                            }
                            const text = toPlain(journal, activeMonth);
                            setLetter(text);
                            const ok = await copyMonth(journal, activeMonth);
                            toast(
                              ok
                                ? `Текст для ${addr} в буфере — вставьте в письмо`
                                : "Почта в превью блокируется. Выделите текст ниже.",
                            );
                          }}
                          className="h-11 rounded-md bg-surface-2 text-xs font-medium text-fg"
                        >
                          На почту
                        </button>
                      </div>
                      <label className="mt-2 block">
                        <span className="sr-only">Почта</span>
                        <input
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="ваш@email"
                          className="mt-1 h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg outline-none placeholder:text-subtle"
                        />
                      </label>
                      {letter ? (
                        <textarea
                          readOnly
                          value={letter}
                          onFocus={(e) => e.currentTarget.select()}
                          className="mt-2 h-64 w-full resize-y rounded-md bg-surface-2 p-3 font-mono text-2xs leading-relaxed text-fg outline-none"
                        />
                      ) : null}
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {(["csv", "md", "pdf", "doc"] as const).map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => {
                              downloadMonth(journal, activeMonth, fmt);
                              toast(fmt === "pdf" ? "PDF: печать → сохранить" : "Файл сохранён");
                            }}
                            className="h-11 rounded-md bg-surface-2 text-xs font-medium uppercase tracking-wide text-fg"
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-2xs text-subtle">
                        Дата, спорт, матч, турнир, исход, зашло / не зашло. Почту из превью открыть нельзя — копируйте текст и вставьте в Gmail.
                      </p>
                    </section>
                  ) : null}
                  {lastDayMisses.length ? (
                    <button
                      type="button"
                      onClick={runMissReview}
                      disabled={missMutation.isPending}
                      className="mt-3 h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg disabled:text-muted"
                    >
                      {missMutation.isPending
                        ? "Разбираю промахи…"
                        : `Почему мимо · ${lastDayMisses.length}`}
                    </button>
                  ) : null}
                  {review ? (
                    <p className="mt-3 text-sm leading-relaxed text-fg">{review}</p>
                  ) : null}
                  {daily.length ? (
                    <ul className="mt-4 grid grid-cols-7 gap-1">
                      {[...daily].reverse().map((day) => (
                        <li
                          key={day.date}
                          className="rounded-md bg-surface-2 px-1 py-2 text-center"
                        >
                          <p className="font-mono text-2xs text-subtle">{formatShortDay(day.date)}</p>
                          <p
                            className={cn(
                              "font-display mt-1 text-sm tabular-nums",
                              day.rate == null ? "text-muted" : day.rate >= 50 ? "text-ok" : "text-live",
                            )}
                          >
                            {day.rate == null ? "—" : `${day.rate}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {journal.length === 0 ? (
                    <p className="mt-3 text-sm leading-relaxed text-muted">
                      Лайнер сам закрывает идеи по финальному счёту. На зашедшую
                      можно нажать — там исходный разбор до матча.
                    </p>
                  ) : visible.length === 0 ? (
                    <p className="mt-3 text-sm leading-relaxed text-muted">
                      По этому виду спорта в журнале пока пусто.
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-2">
                      {visible.map((entry) => (
                        <JournalRow
                          key={entry.id}
                          entry={entry}
                          onOpen={entry.verdict === "hit" ? () => setOpened(entry) : undefined}
                        />
                      ))}
                    </ul>
                  )}
                </section>

                <p className="pb-[env(safe-area-inset-bottom)] text-2xs leading-relaxed text-subtle">
                  18+. Автоучёт по счёту описывает гипотезы брифа, не кассу и не прибыль.
                </p>
              </div>
            </>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function PlayedView({
  entry,
  theses,
  onBack,
}: {
  entry: JournalEntry;
  theses: IdeaSnapshot[];
  onBack: () => void;
}) {
  const thesis = thesisFor(entry, theses);
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="h-11 min-w-11 px-2 text-sm text-accent"
        >
          Назад
        </button>
        <Drawer.Title className="font-display flex-1 pr-3 text-lg font-medium">
          Идея до матча
        </Drawer.Title>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-8">
        <div>
          <p className="font-mono text-2xs tracking-widest text-muted uppercase">
            {SPORT_META[entry.sport]?.label ?? "Спорт"}
            {entry.leagueShort ? ` · ${entry.leagueShort}` : ""}
            {entry.briefingDate ? ` · ${formatLongDate(entry.briefingDate)}` : ""}
          </p>
          <h3 className="font-display mt-1 text-xl font-medium tracking-tight text-fg">
            {entry.match}
          </h3>
          <p className="mt-2 text-sm tracking-wide text-ok uppercase">
            Зашла{entry.score ? ` · ${entry.score}` : ""}
          </p>
        </div>

        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <p className="text-2xs text-subtle">{entry.market}</p>
          <p className="mt-1 text-base text-fg">{entry.pick}</p>
          <p className="mt-2 font-mono text-2xs text-muted">
            {entry.oddsHint ? `${entry.oddsHint} · ` : ""}
            {entry.confidence ? `оценка ${entry.confidence} · ` : ""}
            {entry.risk ? RISK_LABEL[entry.risk] : ""}
          </p>
        </div>

        <section>
          <p className="mb-2 font-mono text-2xs tracking-widest text-muted uppercase">
            разбор до матча
          </p>
          <p className="text-sm leading-relaxed text-fg">{thesis}</p>
        </section>

        <p className="pb-[env(safe-area-inset-bottom)] text-2xs leading-relaxed text-subtle">
          18+. Это тот же текст, что стоял в брифе до свистка. Не касса и не совет ставить.
        </p>
      </div>
    </>
  );
}

function JournalRow({
  entry,
  onOpen,
}: {
  entry: JournalEntry;
  onOpen?: () => void;
}) {
  const row = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm text-fg">{entry.match}</p>
        <p className="font-mono mt-0.5 truncate text-2xs text-muted">
          {SPORT_META[entry.sport]?.label ?? "Спорт"} · {entry.market} · {entry.pick}
          {entry.score ? ` · ${entry.score}` : ""}
          {entry.briefingDate ? ` · ${formatShortDay(entry.briefingDate)}` : ""}
        </p>
        {entry.verdict === "miss" && entry.missNote ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-live">{entry.missNote}</p>
        ) : null}
      </div>
      <span className="flex shrink-0 items-center gap-1 pt-0.5">
        <span
          className={cn(
            "text-2xs tracking-wide uppercase",
            entry.verdict === "hit" && "text-ok",
            entry.verdict === "miss" && "text-live",
            entry.verdict === "void" && "text-muted",
          )}
        >
          {entry.verdict === "hit" ? "зашла" : entry.verdict === "miss" ? "мимо" : "возврат"}
        </span>
        {onOpen ? <ChevronRight className="size-3.5 text-subtle" /> : null}
      </span>
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-11 w-full items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5 text-left"
        >
          {row}
        </button>
      ) : (
        <div className="flex min-h-11 w-full items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2.5">
          {row}
        </div>
      )}
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-md px-3 text-xs tracking-wide whitespace-nowrap",
        active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
      )}
    >
      {children}
    </button>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-3">
      <p className="font-display text-xl font-medium tabular-nums tracking-tight text-fg">
        {value}
      </p>
      <p className="mt-1 text-2xs text-muted">{label}</p>
    </div>
  );
}