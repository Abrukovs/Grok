import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormCompare } from "@/components/app/form-compare";
import { RISK_LABEL, SPORT_META } from "@/lib/briefing/sports";
import type { Tip } from "@/lib/briefing/types";
import { formatKickoff } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  tip: Tip;
  saved?: boolean;
  onToggleSave?: (tip: Tip) => void;
  compact?: boolean;
};

export function TipCard({ tip, saved, onToggleSave, compact = true }: Props) {
  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-lg bg-surface shadow-[var(--shadow-border)]",
        compact ? "p-2" : "p-4",
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <CrestPair home={tip.home} away={tip.away} compact={compact} />
          <div className="min-w-0">
            <p
              className={cn(
                "font-mono text-2xs tracking-widest text-muted uppercase",
                tip.sport === "tennis" ? "line-clamp-2 whitespace-normal" : "truncate",
              )}
            >
              {SPORT_META[tip.sport].label} · {tip.leagueShort}
            </p>
            <h3
              className={cn(
                "font-display mt-0.5 font-medium tracking-tight text-fg",
                compact ? "line-clamp-2 text-xs leading-snug" : "truncate text-sm",
              )}
            >
              {tip.sport === "tennis"
                ? `${tip.home.name} — ${tip.away.name}`
                : `${tip.home.short} — ${tip.away.short}`}
            </h3>
            <p className="mt-0.5 text-2xs text-subtle">{formatKickoff(tip.kickoff)} МСК</p>
          </div>
        </div>
        {onToggleSave ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn("shrink-0", compact ? "size-9 min-h-9 min-w-9" : "size-10 min-h-10 min-w-10")}
            aria-label={saved ? "Убрать из купона" : "В купон"}
            onClick={() => onToggleSave(tip)}
          >
            {saved ? (
              <BookmarkCheck className="size-3.5 text-accent" />
            ) : (
              <Bookmark className="size-3.5 text-muted" />
            )}
          </Button>
        ) : null}
      </div>

      <div className={cn("flex items-end justify-between gap-2", compact ? "mt-2" : "mt-4")}>
        <div className="min-w-0">
          <p className="text-2xs text-subtle">{tip.market}</p>
          <p
            className={cn(
              "font-mono font-medium tabular-nums text-fg",
              compact ? "truncate text-sm" : "text-lg",
            )}
          >
            {tip.pick}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xs text-subtle">ориентир</p>
          <p className="font-mono text-xs tabular-nums text-accent">{tip.oddsHint}</p>
        </div>
      </div>

      <Confidence value={tip.confidence} compact={compact} />

      {compact ? null : <FormCompare home={tip.home} away={tip.away} />}

      <p
        className={cn(
          "text-muted",
          compact ? "mt-1.5 line-clamp-2 text-xs leading-snug" : "mt-3 text-sm leading-relaxed",
        )}
      >
        {tip.rationale}
      </p>

      <div className={cn("mt-auto flex items-center justify-between", compact ? "pt-2" : "mt-3")}>
        <span
          className={cn(
            "text-2xs tracking-wide uppercase",
            tip.risk === "low" && "text-ok",
            tip.risk === "medium" && "text-muted",
            tip.risk === "high" && "text-live",
          )}
        >
          {RISK_LABEL[tip.risk]}
        </span>
      </div>
    </article>
  );
}

function CrestPair({
  home,
  away,
  compact,
}: {
  home: Tip["home"];
  away: Tip["away"];
  compact?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Crest side={home} compact={compact} />
      <Crest side={away} compact={compact} />
    </div>
  );
}

function Crest({ side, compact }: { side: Tip["home"]; compact?: boolean }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-sm bg-fg p-0.5 shadow-[var(--shadow-border)]",
        compact ? "size-7" : "size-10 p-1",
      )}
    >
      {side.logo ? (
        <img
          src={side.logo}
          alt=""
          className="size-full object-contain"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="font-display text-2xs text-accent-fg">{side.short.slice(0, 2)}</span>
      )}
    </div>
  );
}

function Confidence({ value, compact }: { value: number; compact?: boolean }) {
  return (
    <div
      className={cn("flex items-center gap-1.5", compact ? "mt-2" : "mt-3")}
      aria-label={`Уверенность ${value} из 5`}
    >
      <span className="text-2xs text-subtle">оценка</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "rounded-full",
              compact ? "h-1 w-3.5" : "h-1.5 w-5",
              i < value ? "bg-accent" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}
