import { BarChart3, Settings, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatLongDate } from "@/lib/format";

type Props = {
  date: string;
  couponCount: number;
  onOpenCoupon: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
};

export function Header({
  date,
  couponCount,
  onOpenCoupon,
  onOpenStats,
  onOpenSettings,
}: Props) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur-sm">
      <div className="min-w-0">
        <p className="font-display text-lg font-medium tracking-tight">Лайнер</p>
        <p className="truncate text-xs capitalize text-muted">{formatLongDate(date)}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Купон"
          onClick={onOpenCoupon}
          className="relative"
        >
          <Ticket className="size-4" />
          {couponCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-accent font-mono text-2xs text-accent-fg">
              {couponCount}
            </span>
          ) : null}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Статистика" onClick={onOpenStats}>
          <BarChart3 className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Настройки" onClick={onOpenSettings}>
          <Settings className="size-4" />
        </Button>
      </div>
    </header>
  );
}