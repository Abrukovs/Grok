import { create } from "zustand";
import { persist } from "zustand/middleware";
import { moscowDayKey } from "@/lib/format";
import { DEFAULT_SPORTS } from "./sports";
import type { Briefing, IdeaSnapshot, JournalEntry, JournalVerdict, Settlement, SlimTip, Sport, Tip } from "./types";

type AiUsage = { date: string; count: number };

type LinerState = {
  onboarded: boolean;
  sports: Sport[];
  coupon: Tip[];
  journal: JournalEntry[];
  archive: SlimTip[];
  lastBriefing: Briefing | null;
  aiUsage: AiUsage;
  acceptOnboarding: (sports: Sport[]) => void;
  setSports: (sports: Sport[]) => void;
  addToCoupon: (tip: Tip) => void;
  removeFromCoupon: (id: string) => void;
  clearCoupon: () => void;
  settleTip: (tip: Tip, verdict: JournalVerdict) => void;
  rememberTips: (date: string, tips: Tip[]) => void;
  applySettlements: (rows: Settlement[]) => number;
  restoreIdeas: (rows: IdeaSnapshot[]) => void;
  keepBriefing: (briefing: Briefing) => void;
  bumpAiUsage: (date: string) => boolean;
  saveMissNotes: (notes: { tipId: string; note: string }[]) => void;
};

const AI_DAILY_CAP = 6;
const JOURNAL_CAP = 400;
const ARCHIVE_CAP = 200;

function slim(tip: Tip, briefingDate: string): SlimTip {
  return {
    id: tip.id,
    eventId: tip.eventId,
    sport: tip.sport,
    league: tip.league,
    leagueShort: tip.leagueShort,
    home: { name: tip.home.name, short: tip.home.short, logo: tip.home.logo },
    away: { name: tip.away.name, short: tip.away.short, logo: tip.away.logo },
    kickoff: tip.kickoff,
    market: tip.market,
    pick: tip.pick,
    oddsHint: tip.oddsHint,
    confidence: tip.confidence,
    rationale: tip.rationale,
    risk: tip.risk,
    briefingDate,
  };
}

export const useLinerStore = create<LinerState>()(
  persist(
    (set, get) => ({
      onboarded: false,
      sports: DEFAULT_SPORTS,
      coupon: [],
      journal: [],
      archive: [],
      lastBriefing: null,
      aiUsage: { date: "", count: 0 },
      acceptOnboarding: (sports) =>
        set({
          onboarded: true,
          sports: sports.length ? sports : DEFAULT_SPORTS,
        }),
      setSports: (sports) =>
        set({ sports: sports.length ? sports : DEFAULT_SPORTS }),
      addToCoupon: (tip) =>
        set((s) =>
          s.coupon.some((t) => t.id === tip.id)
            ? s
            : { coupon: [...s.coupon, tip] },
        ),
      removeFromCoupon: (id) =>
        set((s) => ({ coupon: s.coupon.filter((t) => t.id !== id) })),
      clearCoupon: () => set({ coupon: [] }),
      settleTip: (tip, verdict) => {
        const entry: JournalEntry = {
          id: crypto.randomUUID(),
          tipId: tip.id,
          match: `${tip.home.short} — ${tip.away.short}`,
          market: tip.market,
          pick: tip.pick,
          sport: tip.sport,
          leagueShort: tip.leagueShort,
          verdict,
          settledAt: new Date().toISOString(),
          briefingDate: moscowDayKey(tip.kickoff),
          source: "manual",
          rationale: tip.rationale,
          oddsHint: tip.oddsHint,
          confidence: tip.confidence,
          risk: tip.risk,
        };
        set((s) => ({
          coupon: s.coupon.filter((t) => t.id !== tip.id),
          archive: s.archive.filter((t) => t.id !== tip.id),
          journal: [entry, ...s.journal.filter((j) => j.tipId !== tip.id)].slice(0, JOURNAL_CAP),
        }));
      },
      rememberTips: (date, tips) => {
        if (!tips.length) return;
        set((s) => {
          const kept = s.archive.filter((t) => t.briefingDate !== date);
          const incoming = tips.map((t) => slim(t, date));
          const byId = new Map(kept.map((t) => [t.id, t]));
          for (const t of incoming) byId.set(t.id, t);
          return { archive: [...byId.values()].slice(-ARCHIVE_CAP) };
        });
      },
      applySettlements: (rows) => {
        const state = get();
        const existing = new Set(state.journal.map((j) => j.tipId));
        const fresh = rows.filter((r) => !existing.has(r.tipId));
        if (!fresh.length) return 0;
        const settledIds = new Set(fresh.map((r) => r.tipId));
        const entries: JournalEntry[] = fresh.map((r) => {
          const snap =
            state.archive.find((t) => t.id === r.tipId) ??
            state.coupon.find((t) => t.id === r.tipId) ??
            state.lastBriefing?.tips.find((t) => t.id === r.tipId);
          return {
            id: crypto.randomUUID(),
            tipId: r.tipId,
            match: r.match,
            market: r.market,
            pick: r.pick,
            sport: r.sport,
            leagueShort: r.leagueShort,
            verdict: r.verdict,
            settledAt: new Date().toISOString(),
            briefingDate: r.briefingDate,
            source: "auto" as const,
            score: r.score,
            rationale: r.rationale || snap?.rationale,
            oddsHint: r.oddsHint || snap?.oddsHint,
            confidence: r.confidence || snap?.confidence,
            risk: r.risk || snap?.risk,
          };
        });
        set((s) => ({
          journal: [...entries, ...s.journal].slice(0, JOURNAL_CAP),
          archive: s.archive.filter((t) => !settledIds.has(t.id)),
          coupon: s.coupon.filter((t) => !settledIds.has(t.id)),
        }));
        return fresh.length;
      },
      restoreIdeas: (rows) => {
        if (!rows.length) return;
        set((s) => {
          let changed = false;
          const journal = s.journal.map((j) => {
            if (j.verdict !== "hit") return j;
            const snap =
              rows.find((r) => r.tipId === j.tipId && r.rationale) ??
              rows.find(
                (r) =>
                  r.rationale &&
                  r.pick === j.pick &&
                  r.match.replace(/[—–−-]/g, " ") === j.match.replace(/[—–−-]/g, " "),
              );
            if (!snap?.rationale) return j;
            if (
              j.rationale === snap.rationale &&
              (j.oddsHint || "") === (snap.oddsHint || "")
            ) {
              return j;
            }
            changed = true;
            return {
              ...j,
              rationale: snap.rationale,
              oddsHint: snap.oddsHint || j.oddsHint,
              confidence: snap.confidence || j.confidence,
              risk: snap.risk || j.risk,
            };
          });
          return changed ? { journal } : s;
        });
      },
      keepBriefing: (briefing) => {
        if (!briefing.tips.length) return;
        set((s) => {
          if (!s.lastBriefing || s.lastBriefing.date !== briefing.date) {
            return { lastBriefing: briefing };
          }
          const byId = new Map(s.lastBriefing.tips.map((t) => [t.id, t]));
          for (const tip of briefing.tips) byId.set(tip.id, tip);
          return {
            lastBriefing: {
              ...briefing,
              tips: [...byId.values()],
              live: briefing.live.length ? briefing.live : s.lastBriefing.live,
            },
          };
        });
      },
      bumpAiUsage: (date) => {
        const usage = get().aiUsage;
        const next = usage.date === date ? usage.count + 1 : 1;
        if (next > AI_DAILY_CAP) return false;
        set({ aiUsage: { date, count: next } });
        return true;
      },
      saveMissNotes: (notes) => {
        if (!notes.length) return;
        const byId = new Map(
          notes
            .filter((n) => n.tipId && n.note.trim())
            .map((n) => [n.tipId, n.note.trim().slice(0, 280)]),
        );
        if (!byId.size) return;
        set((s) => ({
          journal: s.journal.map((j) => {
            const note = byId.get(j.tipId);
            if (!note || j.verdict !== "miss") return j;
            if (j.missNote === note) return j;
            return { ...j, missNote: note };
          }),
        }));
      },
    }),
    {
      name: "liner-store-v2",
      partialize: (s) => ({
        onboarded: s.onboarded,
        sports: s.sports,
        coupon: s.coupon,
        journal: s.journal,
        archive: s.archive,
        aiUsage: s.aiUsage,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LinerState>;
        return {
          ...current,
          ...p,
          journal: Array.isArray(p.journal) ? p.journal : [],
          coupon: Array.isArray(p.coupon) ? p.coupon : [],
          archive: Array.isArray(p.archive) ? p.archive : [],
          lastBriefing: current.lastBriefing,
        };
      },
    },
  ),
);

export { AI_DAILY_CAP };