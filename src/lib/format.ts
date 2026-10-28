export function todayMoscow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function moscowDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayMoscow();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function moscowShift(days: number): string {
  const today = todayMoscow();
  const base = new Date(`${today}T12:00:00+03:00`);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(base.getTime() + days * 24 * 60 * 60 * 1000));
}

export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const key = moscowDayKey(iso);
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  if (key === todayMoscow()) return `сегодня ${time}`;
  if (key === moscowShift(1)) return `завтра ${time}`;
  const weekday = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "short",
  }).format(d);
  return `${weekday} ${time}`;
}

export function formatLongDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00+03:00`);
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

export function formatDayHeading(isoDate: string): string {
  if (isoDate === todayMoscow()) return "Сегодня";
  if (isoDate === moscowShift(1)) return "Завтра";
  return formatLongDate(isoDate);
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatShortDay(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00+03:00`);
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "numeric",
  }).format(d);
}