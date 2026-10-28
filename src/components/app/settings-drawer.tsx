import { Drawer } from "vaul";
import { SPORTS, type Sport } from "@/lib/briefing/types";
import { SPORT_META } from "@/lib/briefing/sports";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sports: Sport[];
  onChangeSports: (sports: Sport[]) => void;
};

export function SettingsDrawer({ open, onOpenChange, sports, onChangeSports }: Props) {
  function toggle(sport: Sport) {
    if (sports.includes(sport)) {
      const next = sports.filter((s) => s !== sport);
      if (next.length) onChangeSports(next);
    } else {
      onChangeSports([...sports, sport]);
    }
  }

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
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[86dvh] max-w-lg flex-col rounded-t-3xl bg-surface shadow-[var(--shadow-border)]">
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border" />
          <Drawer.Title className="font-display px-5 py-4 text-lg font-medium">
            Настройки
          </Drawer.Title>
          <div className="px-5 pb-8">
            <p className="mb-3 text-sm text-muted">Какие линии собирать</p>
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((sport) => {
                const on = sports.includes(sport);
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => toggle(sport)}
                    className={cn(
                      "h-11 rounded-full px-4 text-sm font-medium shadow-[var(--shadow-border)]",
                      on ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
                    )}
                  >
                    {SPORT_META[sport].label}
                  </button>
                );
              })}
            </div>
            <p className="mt-6 text-xs leading-relaxed text-subtle">
              Календарь собирается на сегодня и ближайшие дни. Лайнер не
              принимает ставки и не связан с букмекерами. 18+.
            </p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
