import type { MatchEvent } from "@/lib/briefing/types";
import { SPORT_META } from "@/lib/briefing/sports";

export function LiveStrip({ matches }: { matches: MatchEvent[] }) {
  if (!matches.length) return null;

  return (
    <section className="rounded-lg bg-surface px-3 py-2 shadow-[var(--shadow-border)]">
      <p className="font-mono text-2xs tracking-widest text-live uppercase">в игре</p>
      <ul className="mt-1.5 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {matches.map((m) => (
          <li
            key={m.id}
            className="min-w-40 shrink-0 rounded-md bg-surface-2 px-2.5 py-1.5"
          >
            <p className="truncate text-xs text-fg">
              {m.sport === "tennis" ? `${m.home.name} — ${m.away.name}` : `${m.home.short} — ${m.away.short}`}
            </p>
            <p className="font-mono mt-0.5 truncate text-2xs tabular-nums text-muted">
              {m.leagueShort ? `${m.leagueShort} · ` : ""}
              {m.homeScore ?? "–"}:{m.awayScore ?? "–"}
              <span className="ml-1 text-live">{m.statusText}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
