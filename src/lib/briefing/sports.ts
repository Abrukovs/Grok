import type { Sport } from "./types";

export const SPORT_META: Record<
  Sport,
  { label: string; short: string }
> = {
  football: { label: "Футбол", short: "Футбол" },
  hockey: { label: "Хоккей", short: "КХЛ / NHL" },
  basketball: { label: "Баскетбол", short: "Евролига / NBA" },
  tennis: { label: "Теннис", short: "ATP / WTA" },
  american_football: { label: "NFL", short: "NFL" },
  baseball: { label: "Бейсбол", short: "MLB" },
  mma: { label: "ММА", short: "UFC" },
};

export const DEFAULT_SPORTS: Sport[] = ["football", "tennis"];

export const RISK_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "спокойная",
  medium: "средняя",
  high: "острая",
};
