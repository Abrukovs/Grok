import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Composer } from "@/components/app/composer";
import { CouponDrawer } from "@/components/app/coupon-drawer";
import { Header } from "@/components/app/header";
import { LiveStrip } from "@/components/app/live-strip";
import { SettingsDrawer } from "@/components/app/settings-drawer";
import { StatsDrawer } from "@/components/app/stats-drawer";
import { TipCard } from "@/components/app/tip-card";
import { askAnalyst, getDailyBriefing } from "@/lib/briefing/actions";
import { sortByChance } from "@/lib/briefing/ideas";
import { ruNoun } from "@/lib/briefing/stats";
import { AI_DAILY_CAP, useLinerStore } from "@/lib/briefing/store";
import type { Briefing, IdeaSnapshot, Tip } from "@/lib/briefing/types";
import { snapshotFromSlim, snapshotFromTip } from "@/lib/briefing/thesis";
import { formatClock, todayMoscow } from "@/lib/format";
import { cn } from "@/lib/utils";

type ChatItem =
  | { id: string; role: "bot"; kind: "text"; text: string }
  | { id: string; role: "user"; text: string };

export function Desk() {
  const sports = useLinerStore((s) => s.sports);
  const setSports = useLinerStore((s) => s.setSports);
  const coupon = useLinerStore((s) => s.coupon);
  const journal = useLinerStore((s) => s.journal);
  const addToCoupon = useLinerStore((s) => s.addToCoupon);
  const removeFromCoupon = useLinerStore((s) => s.removeFromCoupon);
  const clearCoupon = useLinerStore((s) => s.clearCoupon);
  const settleTip = useLinerStore((s) => s.settleTip);
  const archive = useLinerStore((s) => s.archive);
  const lastBriefing = useLinerStore((s) => s.lastBriefing);
  const rememberTips = useLinerStore((s) => s.rememberTips);
  const applySettlements = useLinerStore((s) => s.applySettlements);
  const restoreIdeas = useLinerStore((s) => s.restoreIdeas);
  const keepBriefing = useLinerStore((s) => s.keepBriefing);
  const bumpAiUsage = useLinerStore((s) => s.bumpAiUsage);

  const [couponOpen, setCouponOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [calmOnly, setCalmOnly] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const briefingQuery = useQuery({
    queryKey: ["briefing", "v14", sports.join(",")],
    queryFn: () =>
      getDailyBriefing({
        data: { sports, pending: useLinerStore.getState().archive },
      }),
    retry: 2,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const incoming = briefingQuery.data;
  const briefing = mergeBriefings(lastBriefing, incoming);
  const tips = useMemo(() => {
    const all = sortByChance(briefing?.tips ?? []);
    if (!calmOnly) return all;
    const pool = briefing?.calm?.length ? briefing.calm : all;
    return sortByChance(
      pool.filter(
        (t) =>
          t.risk === "low" &&
          (t.sport === "football" ||
            t.sport === "tennis" ||
            t.sport === "basketball" ||
            t.sport === "hockey"),
      ),
    );
  }, [briefing?.tips, briefing?.calm, calmOnly]);
  const theses = useMemo(() => {
    const byId = new Map<string, IdeaSnapshot>();
    for (const row of incoming?.theses ?? []) if (row.rationale) byId.set(row.tipId, row);
    for (const tip of lastBriefing?.tips ?? []) byId.set(tip.id, snapshotFromTip(tip));
    for (const tip of archive) byId.set(tip.id, snapshotFromSlim(tip));
    return [...byId.values()];
  }, [incoming?.theses, lastBriefing?.tips, archive]);

  const askMutation = useMutation({
    mutationFn: (message: string) => askAnalyst({ data: { message, tips } }),
    onSuccess: (res) => {
      setChat((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "bot", kind: "text", text: res.text },
      ]);
    },
    onError: () => {
      setChat((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "bot",
          kind: "text",
          text: "Связь с аналитиком оборвалась. Бриф на экране по-прежнему можно читать.",
        },
      ]);
    },
  });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat, askMutation.isPending]);

  useEffect(() => {
    if (!incoming) return;
    if (incoming.tips.length) {
      keepBriefing(incoming);
      rememberTips(incoming.date, incoming.tips);
      const n = applySettlements(incoming.closed ?? []);
      if (n) toast(`Журнал: закрыто ${n} по счёту`);
    }
    restoreIdeas(incoming.theses ?? []);
  }, [incoming, keepBriefing, rememberTips, applySettlements, restoreIdeas]);

  function toggleSave(tip: Tip) {
    const exists = coupon.some((t) => t.id === tip.id);
    if (exists) {
      removeFromCoupon(tip.id);
      toast("Убрано из купона");
    } else {
      addToCoupon(tip);
      toast("В купоне");
    }
  }

  function send(text: string) {
    if (/только\s*спокойн/i.test(text)) {
      setCalmOnly(true);
      return;
    }
    const date = todayMoscow();
    if (!bumpAiUsage(date)) {
      toast(`Лимит разборов на сегодня: ${AI_DAILY_CAP}`);
      return;
    }
    setChat((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
    askMutation.mutate(text);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
      <Header
        date={briefing?.date ?? todayMoscow()}
        couponCount={coupon.length}
        onOpenCoupon={() => setCouponOpen(true)}
        onOpenStats={() => setStatsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-3 py-3 md:px-4">
        {briefingQuery.isLoading && !briefing ? <BriefingSkeleton /> : null}

        {briefingQuery.isError && !briefing ? (
          <div className="rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
            <p className="text-sm text-fg">Не удалось собрать бриф.</p>
            <button
              type="button"
              className="mt-2 h-11 text-sm text-accent"
              onClick={() => briefingQuery.refetch()}
            >
              Повторить
            </button>
          </div>
        ) : null}

        {briefing ? (
          <div className="liner-enter space-y-3">
            <BotBubble>
              <p className="font-mono text-2xs tracking-widest text-muted uppercase">
                доставлено · {formatClock(briefing.generatedAt)} МСК
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-fg md:text-sm">{briefing.intro}</p>
              {briefing.stats ? (
                <button
                  type="button"
                  onClick={() => setStatsOpen(true)}
                  className="mt-2 flex h-9 w-full items-center justify-between rounded-md bg-surface-2 px-3 text-left"
                >
                  <span className="text-2xs text-muted md:text-xs">
                    {ruNoun(briefing.stats.tipCount, "идея", "идеи", "идей")} ·{" "}
                    {ruNoun(briefing.stats.upcomingCount, "матч", "матча", "матчей")}
                    {briefing.stats.avgConfidence
                      ? ` · оценка ${briefing.stats.avgConfidence.toFixed(1)}`
                      : ""}
                  </span>
                  <span className="text-2xs text-accent md:text-xs">статистика</span>
                </button>
              ) : null}
            </BotBubble>

            <LiveStrip matches={briefing.live} />

            {tips.length === 0 ? (
              <BotBubble>
                <p className="text-sm leading-relaxed text-muted">
                  {calmOnly
                    ? "Спокойных идей по футболу, теннису, баскету и хоккею сейчас нет — либо слоты острые, либо календарь на сегодня пустой. Снимите фильтр, чтобы видеть все гипотезы."
                    : "На ближайшие дни календарь почти пустой — либо всё уже в игре, либо сетка ещё не подтянулась. Откройте бриф чуть позже или добавьте виды спорта в настройках."}
                </p>
              </BotBubble>
            ) : (
              <section className="space-y-2">
                <p className="px-1 font-mono text-2xs tracking-widest text-muted uppercase">
                  {calmOnly ? "спокойные · сегодня" : "по шансам"}
                </p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {tips.map((tip, i) => (
                    <div
                      key={tip.id}
                      className="liner-enter min-w-0"
                      style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                    >
                      <TipCard
                        tip={tip}
                        saved={coupon.some((t) => t.id === tip.id)}
                        onToggleSave={toggleSave}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <p className="px-1 text-2xs leading-relaxed text-subtle">
              18+. Идеи для самостоятельной оценки. Лайнер не принимает ставки
              и не обещает прибыль.
            </p>
          </div>
        ) : null}

        {chat.map((item) =>
          item.role === "user" ? (
            <div key={item.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-xl rounded-br-md bg-accent px-3.5 py-2.5 text-sm text-accent-fg">
                {item.text}
              </div>
            </div>
          ) : (
            <BotBubble key={item.id}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">{item.text}</p>
            </BotBubble>
          ),
        )}

        {askMutation.isPending ? (
          <BotBubble>
            <p className="text-sm text-muted">Смотрю линию…</p>
          </BotBubble>
        ) : null}
      </div>

      <Composer
        disabled={askMutation.isPending}
        calmOn={calmOnly}
        onToggleCalm={() => setCalmOnly((v) => !v)}
        onSend={send}
      />

      <CouponDrawer
        open={couponOpen}
        onOpenChange={setCouponOpen}
        tips={coupon}
        onRemove={removeFromCoupon}
        onClear={clearCoupon}
        onSettle={settleTip}
      />
      <StatsDrawer
        open={statsOpen}
        onOpenChange={setStatsOpen}
        stats={briefing?.stats}
        journal={journal}
        archive={archive}
        theses={theses}
        savedIdeas={briefing?.savedIdeas ?? []}
      />
      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        sports={sports}
        onChangeSports={setSports}
      />
    </div>
  );
}

function mergeBriefings(pinned: Briefing | null, incoming?: Briefing): Briefing | undefined {
  if (!incoming && !pinned) return undefined;
  if (!incoming) return pinned ?? undefined;
  if (!pinned || pinned.date !== incoming.date) {
    return incoming.tips.length ? incoming : pinned ?? incoming;
  }
  const byId = new Map(incoming.tips.map((t) => [t.id, t]));
  if (byId.size < 8) {
    for (const tip of pinned.tips) {
      if (byId.size >= 8) break;
      if (!byId.has(tip.id)) byId.set(tip.id, tip);
    }
  }
  return {
    ...incoming,
    tips: sortByChance([...byId.values()]),
    calm: incoming.calm?.length ? incoming.calm : pinned.calm,
    live: incoming.live.length ? incoming.live : pinned.live,
  };
}

function BotBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <div
        className={cn(
          "mt-1 grid size-7 shrink-0 place-items-center rounded-md bg-accent font-display text-2xs text-accent-fg",
        )}
        aria-hidden
      >
        Л
      </div>
      <div className="min-w-0 flex-1 rounded-xl rounded-tl-md bg-surface px-3.5 py-3 shadow-[var(--shadow-border)]">
        {children}
      </div>
    </div>
  );
}

function BriefingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-surface px-3.5 py-3 shadow-[var(--shadow-border)]">
        <p className="text-sm text-muted">Собираю бриф на сегодня…</p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-40 rounded-lg bg-surface shadow-[var(--shadow-border)]" aria-hidden />
        ))}
      </div>
    </div>
  );
}